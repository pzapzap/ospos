import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { findUserByEmail, findUserByAppleIdentifier, createUser, createUserWithApple, findUserById, deleteUser } from '../db/queries/users';
import { generateToken, authMiddleware } from '../middleware/auth';

const router = Router();
const SALT_ROUNDS = 12;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Apple's public keys endpoint for verifying identity tokens
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

// Strict rate limit on auth endpoints: 20 req per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

// POST /auth/register
router.post('/register', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (typeof email !== 'string' || !EMAIL_REGEX.test(email) || email.length > 255) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 8 and 128 characters' });
      return;
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await createUser(email, passwordHash);

    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    res.status(201).json({ token, userId: user.id, terminalLocationId: user.terminal_location_id });
  } catch (error) {
    console.error('[AUTH] Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /auth/login
router.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Invalid credentials format' });
      return;
    }

    const user = await findUserByEmail(email);
    if (!user || !user.password_hash) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    res.json({ token, userId: user.id, terminalLocationId: user.terminal_location_id });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /auth/apple — Sign in with Apple
router.post('/apple', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { identityToken, email, fullName } = req.body;

    if (!identityToken || typeof identityToken !== 'string') {
      res.status(400).json({ error: 'Identity token is required' });
      return;
    }

    // Decode the identity token to get the Apple user ID (sub claim)
    // Apple identity tokens are JWTs signed by Apple
    let decoded: { sub?: string; email?: string };
    try {
      // Decode without verification first to get header for key lookup
      decoded = jwt.decode(identityToken) as { sub?: string; email?: string };
      if (!decoded?.sub) {
        throw new Error('Missing sub claim');
      }

      // Verify the token signature using Apple's public keys
      const header = jwt.decode(identityToken, { complete: true })?.header;
      if (!header?.kid) {
        throw new Error('Missing kid in token header');
      }

      const keysResponse = await fetch(APPLE_KEYS_URL);
      const keysData = await keysResponse.json() as { keys: Array<{ kid: string; kty: string; use: string; alg: string; n: string; e: string }> };
      const appleKey = keysData.keys.find((k: { kid: string }) => k.kid === header.kid);
      if (!appleKey) {
        throw new Error('Apple public key not found');
      }

      // Convert JWK to PEM for verification
      const { createPublicKey } = await import('crypto');
      const publicKey = createPublicKey({ key: appleKey, format: 'jwk' });

      jwt.verify(identityToken, publicKey, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
      });
    } catch (verifyErr) {
      console.error('[AUTH] Apple token verification failed:', verifyErr);
      res.status(401).json({ error: 'Invalid Apple identity token' });
      return;
    }

    const appleIdentifier = decoded.sub!;
    // Apple provides email on first sign-in only; use token email as fallback
    const userEmail = email || decoded.email || `apple_${appleIdentifier.slice(0, 8)}@private.appleid.com`;

    // Check if user already exists with this Apple ID
    let user = await findUserByAppleIdentifier(appleIdentifier);
    let isNewUser = false;

    if (!user) {
      // Check if email already exists (user previously registered with email/password)
      const existingByEmail = await findUserByEmail(userEmail);
      if (existingByEmail) {
        // Link Apple ID to existing account
        const { query } = await import('../db/connection');
        await query('UPDATE users SET apple_identifier = $1 WHERE id = $2', [appleIdentifier, existingByEmail.id]);
        user = { ...existingByEmail, apple_identifier: appleIdentifier };
      } else {
        // Create new user
        user = await createUserWithApple(userEmail, appleIdentifier);
        isNewUser = true;
      }
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    res.json({ token, userId: user.id, isNewUser, terminalLocationId: user.terminal_location_id });
  } catch (error) {
    console.error('[AUTH] Apple auth error:', error);
    res.status(500).json({ error: 'Apple sign-in failed' });
  }
});

// POST /auth/delete-account — Delete user account and all associated data
router.post('/delete-account', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await findUserById(req.user.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Revoke the caller's JWT BEFORE deleting the user. Migration 005 changed
    // the FK to ON DELETE SET NULL so the revocation row outlives the user
    // and authMiddleware can keep matching the jti for the token's full
    // 24h lifetime. Without this, a stolen token would replay against any
    // /sync/pull, /payments/refund, etc. for hours after deletion.
    if (req.jwtJti && req.jwtExp) {
      const { query } = await import('../db/connection');
      await query(
        'INSERT INTO revoked_tokens (jti, user_id, expires_at, reason) VALUES ($1, $2, to_timestamp($3), $4) ON CONFLICT (jti) DO NOTHING',
        [req.jwtJti, req.user.userId, req.jwtExp, 'account_deletion']
      );
    }

    // CASCADE deletes all related data (synced_orders, receipt_logs, dispute_records).
    // revoked_tokens.user_id is now ON DELETE SET NULL — the revocation we just
    // inserted survives this delete.
    await deleteUser(user.id);

    console.log(`[AUTH] Account deleted: ${user.id}`);
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('[AUTH] Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// POST /auth/logout — Revoke the caller's JWT server-side. Client should
// also clearToken() locally; this guarantees the JWT can't be replayed even
// if exfiltrated before its natural 24h expiry.
router.post('/logout', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.jwtJti || !req.jwtExp) {
      // Legacy tokens without jti can't be revoked; they expire on their own.
      res.json({ success: true });
      return;
    }
    const { query } = await import('../db/connection');
    await query(
      'INSERT INTO revoked_tokens (jti, user_id, expires_at, reason) VALUES ($1, $2, to_timestamp($3), $4) ON CONFLICT (jti) DO NOTHING',
      [req.jwtJti, req.user.userId, req.jwtExp, 'logout']
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[AUTH] Logout error:', error);
    // Don't fail the user's logout flow over a server hiccup — the token is
    // short-lived anyway.
    res.json({ success: true });
  }
});

export default router;

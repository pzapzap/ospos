import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { findUserByEmail, createUser } from '../db/queries/users';
import { generateToken } from '../middleware/auth';

const router = Router();
const SALT_ROUNDS = 12;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      stripeAccountId: user.stripe_account_id,
    });

    res.status(201).json({ token, userId: user.id });
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
    if (!user) {
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
      stripeAccountId: user.stripe_account_id,
    });

    res.json({ token, userId: user.id });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;

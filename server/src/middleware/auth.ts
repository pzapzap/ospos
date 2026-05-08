import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { queryOne } from '../db/connection';

export interface JwtPayload {
  userId: string;
  email: string;
  jti?: string; // JWT ID — used for server-side revocation
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
      jwtJti?: string;
      jwtExp?: number;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
    }) as JwtPayload & { jti?: string; exp?: number };

    // Server-side revocation check. Skip if token has no jti (legacy tokens
    // issued before refresh-tokens migration shipped — they expire within 24h
    // anyway, so we accept them until they expire naturally).
    if (decoded.jti) {
      const revoked = await queryOne<{ jti: string }>(
        'SELECT jti FROM revoked_tokens WHERE jti = $1',
        [decoded.jti]
      );
      if (revoked) {
        res.status(401).json({ error: 'Token has been revoked' });
        return;
      }
    }

    req.user = { userId: decoded.userId, email: decoded.email };
    req.jwtJti = decoded.jti;
    req.jwtExp = decoded.exp;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function generateToken(payload: JwtPayload): string {
  // Always issue with a jti so we can revoke it later. Keep the type signature
  // permissive — callers don't need to construct one themselves.
  const jti = payload.jti ?? randomUUID();
  return jwt.sign({ userId: payload.userId, email: payload.email, jti }, config.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn,
  });
}

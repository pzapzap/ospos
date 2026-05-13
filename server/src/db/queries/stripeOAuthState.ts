import crypto from 'crypto';
import { query, queryOne } from '../connection';

// Generates a cryptographically random, URL-safe state token, persists it
// scoped to a user with a 10-minute TTL (default applied by the column),
// and prunes expired rows opportunistically so the table never bloats.
export async function createOAuthState(userId: string): Promise<string> {
  await query('DELETE FROM stripe_oauth_state WHERE expires_at < NOW()');
  const state = crypto.randomBytes(32).toString('base64url');
  await query(
    'INSERT INTO stripe_oauth_state (state, user_id) VALUES ($1, $2)',
    [state, userId]
  );
  return state;
}

// Single-use: DELETE..RETURNING ensures the row cannot be replayed. Returns
// null for unknown, expired, or already-consumed state values — the caller
// must treat null as "reject this callback" (CSRF/replay protection).
export async function consumeOAuthState(state: string): Promise<{ user_id: string } | null> {
  return queryOne<{ user_id: string }>(
    'DELETE FROM stripe_oauth_state WHERE state = $1 AND expires_at > NOW() RETURNING user_id',
    [state]
  );
}

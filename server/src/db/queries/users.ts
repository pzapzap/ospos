import { query, queryOne } from '../connection';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  stripe_account_id: string | null;
  push_token: string | null;
  created_at: string;
}

// Safe user type without password_hash — use for non-auth lookups
export interface SafeUser {
  id: string;
  email: string;
  stripe_account_id: string | null;
  push_token: string | null;
  created_at: string;
}

// Auth queries need password_hash
export async function findUserByEmail(email: string): Promise<User | null> {
  return queryOne<User>('SELECT id, email, password_hash, stripe_account_id, push_token, created_at FROM users WHERE email = $1', [email]);
}

// Non-auth lookups never return password_hash
export async function findUserById(id: string): Promise<SafeUser | null> {
  return queryOne<SafeUser>('SELECT id, email, stripe_account_id, push_token, created_at FROM users WHERE id = $1', [id]);
}

export async function createUser(email: string, passwordHash: string): Promise<User> {
  const rows = await query<User>(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, password_hash, stripe_account_id, push_token, created_at',
    [email, passwordHash]
  );
  return rows[0];
}

export async function updateUserStripeAccount(
  userId: string,
  stripeAccountId: string
): Promise<void> {
  await query(
    'UPDATE users SET stripe_account_id = $1 WHERE id = $2',
    [stripeAccountId, userId]
  );
}

export async function updateUserPushToken(
  userId: string,
  pushToken: string
): Promise<void> {
  await query(
    'UPDATE users SET push_token = $1 WHERE id = $2',
    [pushToken, userId]
  );
}

export async function findUserByStripeAccount(
  stripeAccountId: string
): Promise<SafeUser | null> {
  return queryOne<SafeUser>(
    'SELECT id, email, stripe_account_id, push_token, created_at FROM users WHERE stripe_account_id = $1',
    [stripeAccountId]
  );
}

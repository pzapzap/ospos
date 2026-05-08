-- Server-side JWT revocation list. JWTs are stateless by default; this
-- blacklist lets us invalidate tokens before their natural 24h expiry on
-- logout, account deletion, or detected compromise.
--
-- A token's jti (JWT ID, UUID) is inserted here on revocation. The
-- authMiddleware checks every incoming token's jti against this table.
--
-- Rows are pruned by a scheduled job once their expiry has passed (no point
-- keeping a revocation record for a token that's already invalid).

CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires
  ON revoked_tokens(expires_at);

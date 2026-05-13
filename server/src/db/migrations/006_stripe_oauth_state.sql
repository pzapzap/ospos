-- Short-lived state-parameter store for Stripe Connect OAuth.
--
-- Each /stripe/oauth/start inserts one row; the matching
-- /stripe/oauth/callback consumes (deletes) it.
--
-- The 'state' parameter is what binds an unauthenticated callback (Stripe's
-- browser redirect carries no JWT) to a specific OSPOS user. Required for
-- CSRF protection and to prevent code-replay across users.

CREATE TABLE IF NOT EXISTS stripe_oauth_state (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes')
);

CREATE INDEX IF NOT EXISTS idx_stripe_oauth_state_expires
  ON stripe_oauth_state(expires_at);

INSERT INTO schema_migrations (version) VALUES (6)
  ON CONFLICT (version) DO NOTHING;

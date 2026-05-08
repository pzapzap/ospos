-- Allow revoked_tokens rows to outlive the user row.
--
-- Originally the FK was ON DELETE CASCADE so cleaning up a user's revoked
-- tokens happened automatically. But that defeats /auth/delete-account: we
-- need to revoke the caller's JWT *and* have that revocation survive the
-- subsequent CASCADE-delete of the user, so the token can't be replayed
-- during its remaining ~24h lifetime.
--
-- ON DELETE SET NULL keeps the revocation around (with user_id=NULL) so
-- authMiddleware can still match the jti and 401 the request.

ALTER TABLE revoked_tokens
  DROP CONSTRAINT IF EXISTS revoked_tokens_user_id_fkey;

ALTER TABLE revoked_tokens
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE revoked_tokens
  ADD CONSTRAINT revoked_tokens_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

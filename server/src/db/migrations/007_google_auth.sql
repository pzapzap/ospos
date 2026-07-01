-- Google Sign-In support (Android).
-- google_identifier: unique Google user ID from ID token 'sub' claim.
-- Nullable + UNIQUE so users may have Apple, Google, email/password, or any combination.

ALTER TABLE users ADD COLUMN google_identifier TEXT UNIQUE;

INSERT INTO schema_migrations (version) VALUES (7);

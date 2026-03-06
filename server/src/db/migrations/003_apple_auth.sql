-- Add Apple Sign-in support and make password optional
-- apple_identifier: unique Apple user ID from identity token 'sub' claim
-- password_hash: nullable for Apple-only users
-- auth_method: tracks how user authenticated

ALTER TABLE users ADD COLUMN apple_identifier TEXT UNIQUE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

INSERT INTO schema_migrations (version) VALUES (3);

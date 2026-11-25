-- migrate: rebuild
-- =============================================================================
-- Migration 0003: username and password sign-in replaces Firebase (#182, #185)
-- =============================================================================
--
-- The runner sees the "migrate: rebuild" marker on line 1 and applies this file
-- with foreign keys OFF (dropping `users` would otherwise cascade-delete every
-- user's data), then runs PRAGMA foreign_key_check before committing.
--
-- `users` loses firebase_uid and gains username (case-insensitive, unique),
-- password_hash (argon2id, encoded) and must_change_password.
--
-- EXISTING USERS get the placeholder username "user-<id>" and the password hash
-- '!', which is not a valid encoding and so never verifies. Nobody can sign in
-- as them until an operator runs `api user set-password --username user-<id>`
-- (see the runbook, #194). Their data is untouched.
-- =============================================================================

CREATE TABLE users_new (
    id                   INTEGER PRIMARY KEY,
    username             TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(username)) > 0),
    password_hash        TEXT    NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
    email                TEXT    COLLATE NOCASE,
    display_name         TEXT,
    role                 TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT INTO users_new (id, username, password_hash, must_change_password, email, display_name, role, created_at, updated_at)
SELECT id, 'user-' || id, '!', 0, email, display_name, role, created_at, updated_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- Dropping `users` dropped its trigger; recreate it unchanged from 0001.
CREATE TRIGGER users_seed_protected_rows
AFTER INSERT ON users
BEGIN
    INSERT INTO categories     (user_id, name, is_protected, sort_order) VALUES (NEW.id, 'Other', 1, 1000000);
    INSERT INTO income_sources (user_id, name, is_protected, sort_order) VALUES (NEW.id, 'Other', 1, 1000000);
END;

-- One row per sign-in. Only the SHA-256 of the token is stored; deleting the
-- row signs that device out. Sessions last 30 days from created_at.
CREATE TABLE sessions (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash   BLOB    NOT NULL UNIQUE,
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_used_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_created_idx ON sessions (created_at);

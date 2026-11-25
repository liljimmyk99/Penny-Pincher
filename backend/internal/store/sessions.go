package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"strconv"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/auth"
)

const tsLayout = "2006-01-02T15:04:05.000Z"

func formatTS(t time.Time) string { return t.UTC().Format(tsLayout) }

func hashToken(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}

// Sessions reads and writes the sessions table. Only the SHA-256 of a token
// is stored, so a copy of the database cannot be used to sign in.
type Sessions struct {
	DB  *sql.DB
	Now func() time.Time // defaults to time.Now
}

func (s Sessions) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// Create starts a session for the user and returns its token (256 random bits,
// shown once) and its expiry.
func (s Sessions) Create(ctx context.Context, userID int64) (token string, expires time.Time, err error) {
	return createSession(ctx, s.DB, userID, s.now())
}

type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func createSession(ctx context.Context, db execer, userID int64, now time.Time) (string, time.Time, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	ts := formatTS(now)
	if _, err := db.ExecContext(ctx,
		`INSERT INTO sessions (user_id, token_hash, created_at, last_used_at) VALUES (?, ?, ?, ?)`,
		userID, hashToken(token), ts, ts); err != nil {
		return "", time.Time{}, err
	}
	return token, now.Add(auth.MaxSessionAge), nil
}

// Lookup implements auth.SessionLookup: it finds the session and its user,
// refuses a session older than auth.MaxSessionAge, and records the use.
func (s Sessions) Lookup(ctx context.Context, token string) (auth.Identity, error) {
	var (
		sid, uid    int64
		created     string
		username    string
		email, name sql.NullString
		role        string
		must        int
	)
	err := s.DB.QueryRowContext(ctx,
		`SELECT s.id, s.created_at, u.id, u.username, u.email, u.display_name, u.role, u.must_change_password
		   FROM sessions s JOIN users u ON u.id = s.user_id
		  WHERE s.token_hash = ?`, hashToken(token)).
		Scan(&sid, &created, &uid, &username, &email, &name, &role, &must)
	if errors.Is(err, sql.ErrNoRows) {
		return auth.Identity{}, auth.ErrUnknownSession
	}
	if err != nil {
		return auth.Identity{}, err
	}
	now := s.now()
	if t, perr := time.Parse(tsLayout, created); perr != nil || now.Sub(t) > auth.MaxSessionAge {
		return auth.Identity{}, auth.ErrSessionExpired
	}
	if _, err := s.DB.ExecContext(ctx, `UPDATE sessions SET last_used_at = ? WHERE id = ?`, formatTS(now), sid); err != nil {
		return auth.Identity{}, err
	}
	id := auth.Identity{
		ID: strconv.FormatInt(uid, 10), Username: username, Role: auth.Role(role),
		MustChangePassword: must == 1, SessionID: sid,
	}
	if email.Valid {
		id.Email = &email.String
	}
	if name.Valid {
		id.DisplayName = &name.String
	}
	return id, nil
}

// Revoke signs out one session (this device).
func (s Sessions) Revoke(ctx context.Context, sessionID int64) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, sessionID)
	return err
}

// RevokeAllForUser signs the user out everywhere.
func (s Sessions) RevokeAllForUser(ctx context.Context, userID int64) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, userID)
	return err
}

// DeleteExpired removes sessions past their lifetime and returns how many.
func (s Sessions) DeleteExpired(ctx context.Context) (int64, error) {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM sessions WHERE created_at < ?`, formatTS(s.now().Add(-auth.MaxSessionAge)))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

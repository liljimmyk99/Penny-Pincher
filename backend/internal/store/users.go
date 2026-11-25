package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Role values match the users.role CHECK constraint.
const (
	RoleAdmin  = "admin"
	RoleMember = "member"
)

// DefaultTemplateName names the empty template every new user starts with.
const DefaultTemplateName = "Default"

// defaultCategories are seeded in this order (sort_order 10, 20, ...). The
// protected "Other" category is created by a trigger and sorts last.
var defaultCategories = []struct {
	Name     string
	IsSaving bool
}{
	{"Saving", true},
	{"Housing", false},
	{"Utilities", false},
	{"Food", false},
	{"Transportation", false},
	{"Entertainment", false},
	{"Debt", false},
}

// ErrUserExists is returned when the username is taken (case-insensitively).
var ErrUserExists = errors.New("user with this username already exists")

// ErrNoUser is returned when no user matches.
var ErrNoUser = errors.New("no such user")

// NewUser describes an account to add. PasswordHash is an encoded argon2id
// hash (auth.Hasher.Hash); this package never sees a plain password.
type NewUser struct {
	Username           string
	PasswordHash       string
	MustChangePassword bool
	Email              string // optional
	DisplayName        string // optional
	Role               string // RoleAdmin or RoleMember
}

// AddUser inserts a user and seeds their defaults in one transaction: the
// insert trigger creates the protected "Other" rows, then this adds the
// remaining default categories and an empty template. It returns the new
// user's id.
func AddUser(ctx context.Context, db *sql.DB, u NewUser) (int64, error) {
	u.Username = strings.TrimSpace(u.Username)
	if u.Username == "" {
		return 0, errors.New("username is required")
	}
	if u.PasswordHash == "" {
		return 0, errors.New("password hash is required")
	}
	if u.Role != RoleAdmin && u.Role != RoleMember {
		return 0, fmt.Errorf("invalid role %q (want admin or member)", u.Role)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var exists bool
	if err := tx.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM users WHERE username = ?)`, u.Username).Scan(&exists); err != nil {
		return 0, err
	}
	if exists {
		return 0, ErrUserExists
	}

	res, err := tx.ExecContext(ctx,
		`INSERT INTO users (username, password_hash, must_change_password, email, display_name, role) VALUES (?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), ?)`,
		u.Username, u.PasswordHash, u.MustChangePassword, strings.TrimSpace(u.Email), strings.TrimSpace(u.DisplayName), u.Role)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}

	for i, c := range defaultCategories {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO categories (user_id, name, is_saving, sort_order) VALUES (?, ?, ?, ?)`,
			id, c.Name, c.IsSaving, (i+1)*10); err != nil {
			return 0, fmt.Errorf("seed category %q: %w", c.Name, err)
		}
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO templates (user_id, name) VALUES (?, ?)`, id, DefaultTemplateName); err != nil {
		return 0, fmt.Errorf("seed template: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return id, nil
}

// UserRow is one account as the admin panel lists it. It holds account details
// only, never any of the user's entries or counts of them.
type UserRow struct {
	ID                 int64
	Username           string
	MustChangePassword bool
	Email              *string
	DisplayName        *string
	Role               string
	CreatedAt          string
}

// ListUsers returns every user, oldest first. It is not scoped to a user
// because it serves the admin-only Users tab and returns no user data.
func ListUsers(ctx context.Context, db *sql.DB) ([]UserRow, error) {
	rows, err := db.QueryContext(ctx,
		`SELECT id, username, must_change_password, email, display_name, role, created_at FROM users ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []UserRow{}
	for rows.Next() {
		var u UserRow
		if err := rows.Scan(&u.ID, &u.Username, &u.MustChangePassword, &u.Email, &u.DisplayName, &u.Role, &u.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// GetUserRow returns one user by id.
func GetUserRow(ctx context.Context, db *sql.DB, id int64) (UserRow, error) {
	var u UserRow
	err := db.QueryRowContext(ctx,
		`SELECT id, username, must_change_password, email, display_name, role, created_at FROM users WHERE id = ?`, id).
		Scan(&u.ID, &u.Username, &u.MustChangePassword, &u.Email, &u.DisplayName, &u.Role, &u.CreatedAt)
	return u, err
}

// UserAuth is what sign-in needs about an account.
type UserAuth struct {
	ID                 int64
	Username           string
	PasswordHash       string
	MustChangePassword bool
	Email              *string
	DisplayName        *string
	Role               string
}

// FindUserByUsername returns the account for a username (case-insensitive),
// or ErrNoUser.
func FindUserByUsername(ctx context.Context, db *sql.DB, username string) (UserAuth, error) {
	return scanUserAuth(db.QueryRowContext(ctx,
		`SELECT id, username, password_hash, must_change_password, email, display_name, role FROM users WHERE username = ?`,
		strings.TrimSpace(username)))
}

// FindUserByID returns the account for an id, or ErrNoUser.
func FindUserByID(ctx context.Context, db *sql.DB, id int64) (UserAuth, error) {
	return scanUserAuth(db.QueryRowContext(ctx,
		`SELECT id, username, password_hash, must_change_password, email, display_name, role FROM users WHERE id = ?`, id))
}

func scanUserAuth(row *sql.Row) (UserAuth, error) {
	var u UserAuth
	var email, name sql.NullString
	err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.MustChangePassword, &email, &name, &u.Role)
	if errors.Is(err, sql.ErrNoRows) {
		return UserAuth{}, ErrNoUser
	}
	if err != nil {
		return UserAuth{}, err
	}
	if email.Valid {
		u.Email = &email.String
	}
	if name.Valid {
		u.DisplayName = &name.String
	}
	return u, nil
}

// SetPassword stores a new password hash and signs the user out on every
// device (all their sessions are deleted), in one transaction. It returns
// ErrNoUser when the id matches nobody.
func SetPassword(ctx context.Context, db *sql.DB, userID int64, hash string, mustChange bool) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx,
		`UPDATE users SET password_hash = ?, must_change_password = ?, updated_at = ? WHERE id = ?`,
		hash, mustChange, formatTS(time.Now()), userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNoUser
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, userID); err != nil {
		return err
	}
	return tx.Commit()
}

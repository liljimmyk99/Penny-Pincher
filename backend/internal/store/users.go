package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
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

// ErrUserExists is returned when the Firebase uid is already in the allowlist.
var ErrUserExists = errors.New("user with this firebase uid already exists")

// NewUser describes an account to add to the allowlist.
type NewUser struct {
	FirebaseUID string
	Email       string // optional
	DisplayName string // optional
	Role        string // RoleAdmin or RoleMember
}

// AddUser inserts a user and seeds their defaults in one transaction: the
// insert trigger creates the protected "Other" rows, then this adds the
// remaining default categories and an empty template. It returns the new
// user's id.
func AddUser(ctx context.Context, db *sql.DB, u NewUser) (int64, error) {
	u.FirebaseUID = strings.TrimSpace(u.FirebaseUID)
	if u.FirebaseUID == "" {
		return 0, errors.New("firebase uid is required")
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
		`SELECT EXISTS (SELECT 1 FROM users WHERE firebase_uid = ?)`, u.FirebaseUID).Scan(&exists); err != nil {
		return 0, err
	}
	if exists {
		return 0, ErrUserExists
	}

	res, err := tx.ExecContext(ctx,
		`INSERT INTO users (firebase_uid, email, display_name, role) VALUES (?, NULLIF(?, ''), NULLIF(?, ''), ?)`,
		u.FirebaseUID, strings.TrimSpace(u.Email), strings.TrimSpace(u.DisplayName), u.Role)
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
	ID          int64
	FirebaseUID string
	Email       *string
	DisplayName *string
	Role        string
	CreatedAt   string
}

// ListUsers returns every user, oldest first. It is not scoped to a user
// because it serves the admin-only Users tab and returns no user data.
func ListUsers(ctx context.Context, db *sql.DB) ([]UserRow, error) {
	rows, err := db.QueryContext(ctx,
		`SELECT id, firebase_uid, email, display_name, role, created_at FROM users ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []UserRow{}
	for rows.Next() {
		var u UserRow
		if err := rows.Scan(&u.ID, &u.FirebaseUID, &u.Email, &u.DisplayName, &u.Role, &u.CreatedAt); err != nil {
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
		`SELECT id, firebase_uid, email, display_name, role, created_at FROM users WHERE id = ?`, id).
		Scan(&u.ID, &u.FirebaseUID, &u.Email, &u.DisplayName, &u.Role, &u.CreatedAt)
	return u, err
}

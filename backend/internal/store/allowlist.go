package store

import (
	"context"
	"database/sql"
	"errors"
	"strconv"

	"github.com/liljimmyk99/penny-pincher/backend/internal/auth"
)

// Users reads the users table (the allowlist).
type Users struct{ DB *sql.DB }

// FindByFirebaseUID implements auth.UserLookup.
func (u Users) FindByFirebaseUID(ctx context.Context, uid string) (auth.Identity, error) {
	var (
		id          int64
		email, name sql.NullString
		role        string
	)
	err := u.DB.QueryRowContext(ctx,
		`SELECT id, email, display_name, role FROM users WHERE firebase_uid = ?`, uid).
		Scan(&id, &email, &name, &role)
	if errors.Is(err, sql.ErrNoRows) {
		return auth.Identity{}, auth.ErrUnknownUser
	}
	if err != nil {
		return auth.Identity{}, err
	}
	ident := auth.Identity{ID: strconv.FormatInt(id, 10), Role: auth.Role(role)}
	if email.Valid {
		ident.Email = &email.String
	}
	if name.Valid {
		ident.DisplayName = &name.String
	}
	return ident, nil
}

package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"unicode/utf8"
)

// Merchant is a merchants row. Names are unique per user, case-insensitively.
type Merchant struct {
	ID   int64
	Name string
}

// Merchants reads the merchants table. Merchants are created implicitly when
// an expense (or template item) names one that does not exist yet. Every
// method is scoped to the given user.
type Merchants struct{ DB *sql.DB }

// List returns the user's merchants sorted by name (case-insensitively). A
// non-empty prefix keeps only names starting with it, matched
// case-insensitively. It returns at most limit rows, and a cursor for the next
// page ("" on the last one).
func (m Merchants) List(ctx context.Context, userID int64, prefix string, page Page) ([]Merchant, string, error) {
	limit, err := page.limit()
	if err != nil {
		return nil, "", err
	}
	where := []string{"user_id = ?"}
	args := []any{userID}
	if prefix != "" {
		where = append(where, `name LIKE ? ESCAPE '\'`)
		args = append(args, escapeLike(prefix)+"%")
	}
	if page.Cursor != "" {
		parts, err := decodeCursor(page.Cursor, 1)
		if err != nil {
			return nil, "", err
		}
		// name is COLLATE NOCASE and unique per user, so it alone is a stable key.
		where = append(where, "name > ?")
		args = append(args, parts[0])
	}
	args = append(args, limit+1)
	rows, err := m.DB.QueryContext(ctx,
		`SELECT id, name FROM merchants WHERE `+strings.Join(where, " AND ")+` ORDER BY name, id LIMIT ?`, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	out := []Merchant{}
	for rows.Next() {
		var mer Merchant
		if err := rows.Scan(&mer.ID, &mer.Name); err != nil {
			return nil, "", err
		}
		out = append(out, mer)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}
	next := ""
	if len(out) > limit {
		out = out[:limit]
		next = encodeCursor(out[limit-1].Name)
	}
	return out, next, nil
}

// cleanMerchantName trims a merchant name and checks the spec's 1–100
// character limit. field names the request field in errors.
func cleanMerchantName(s, field string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", invalid(field, "must not be empty")
	}
	if utf8.RuneCountInString(s) > 100 {
		return "", invalid(field, "must be at most 100 characters")
	}
	return s, nil
}

// resolveMerchant returns the user's merchant with this name, matched
// case-insensitively, creating it (with this spelling) if there is none. name
// must already be cleaned.
func resolveMerchant(ctx context.Context, tx *sql.Tx, userID int64, name string) (Merchant, error) {
	var mer Merchant
	// merchants.name is COLLATE NOCASE, so = matches case-insensitively.
	err := tx.QueryRowContext(ctx,
		`SELECT id, name FROM merchants WHERE user_id = ? AND name = ?`, userID, name).Scan(&mer.ID, &mer.Name)
	if err == nil {
		return mer, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return Merchant{}, err
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO merchants (user_id, name) VALUES (?, ?)`, userID, name)
	if err != nil {
		return Merchant{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Merchant{}, err
	}
	return Merchant{ID: id, Name: name}, nil
}

// escapeLike escapes LIKE wildcards so a prefix matches literally.
func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

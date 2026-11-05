package store

import (
	"context"
	"database/sql"
	"errors"
)

// Helpers shared by the user-owned lists that have a protected "Other" row and
// a sort_order: categories and income_sources. table is always one of those
// constant names, never user input.

// nextSortOrder returns the sort_order for a new row: after every unprotected
// row. If the protected "Other" row is currently last, it is moved down so it
// stays last.
func nextSortOrder(ctx context.Context, tx *sql.Tx, table string, userID int64) (int, error) {
	var maxSort int
	if err := tx.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(sort_order), 0) FROM `+table+` WHERE user_id = ? AND is_protected = 0`,
		userID).Scan(&maxSort); err != nil {
		return 0, err
	}
	sort := maxSort + sortStep
	var otherID int64
	var otherSort int
	err := tx.QueryRowContext(ctx,
		`SELECT id, sort_order FROM `+table+` WHERE user_id = ? AND is_protected = 1`, userID).
		Scan(&otherID, &otherSort)
	switch {
	case errors.Is(err, sql.ErrNoRows):
	case err != nil:
		return 0, err
	case otherSort > maxSort && sort >= otherSort:
		// "Other" is last: keep it last.
		if _, err := tx.ExecContext(ctx,
			`UPDATE `+table+` SET sort_order = ?, updated_at = `+nowSQL+` WHERE id = ? AND user_id = ?`,
			sort+sortStep, otherID, userID); err != nil {
			return 0, err
		}
	}
	return sort, nil
}

// applyOrder sets sort_order from ids, which must name every id in have
// exactly once. Otherwise it returns a validation error on "ids" and changes
// nothing. noun names the kind of row in that error.
func applyOrder(ctx context.Context, tx *sql.Tx, table string, userID int64, have, ids []int64, noun string) error {
	bad := invalid("ids", "must list every "+noun+" exactly once")
	if len(ids) != len(have) {
		return bad
	}
	pending := make(map[int64]bool, len(have))
	for _, id := range have {
		pending[id] = true
	}
	for _, id := range ids {
		if !pending[id] {
			return bad
		}
		delete(pending, id)
	}
	for i, id := range ids {
		if _, err := tx.ExecContext(ctx,
			`UPDATE `+table+` SET sort_order = ?, updated_at = `+nowSQL+` WHERE id = ? AND user_id = ?`,
			(i+1)*sortStep, id, userID); err != nil {
			return err
		}
	}
	return nil
}

// checkNameFree returns ErrNameTaken when another of the user's rows in table
// (other than exceptID) has this name, case-insensitively.
func checkNameFree(ctx context.Context, q querier, table string, userID int64, name string, exceptID int64) error {
	var taken bool
	if err := q.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM `+table+` WHERE user_id = ? AND name = ? COLLATE NOCASE AND id <> ?)`,
		userID, name, exceptID).Scan(&taken); err != nil {
		return err
	}
	if taken {
		return ErrNameTaken
	}
	return nil
}

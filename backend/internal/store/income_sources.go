package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// IncomeSource is an income source row.
type IncomeSource struct {
	ID          int64
	Name        string
	IsProtected bool // true only for "Other"
	HasEntries  bool // derived: the user has income entries for it
	SortOrder   int
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// IncomeSources reads and writes the income_sources table. Every method is
// scoped to the given user; another user's sources behave as if they do not
// exist.
type IncomeSources struct{ DB *sql.DB }

const incomeSourceCols = `s.id, s.name, s.is_protected, s.sort_order, s.created_at, s.updated_at,
	EXISTS (SELECT 1 FROM income_entries e WHERE e.user_id = s.user_id AND e.income_source_id = s.id)`

// List returns every income source for the user, in sort order.
func (s IncomeSources) List(ctx context.Context, userID int64) ([]IncomeSource, error) {
	return listIncomeSources(ctx, s.DB, userID)
}

// Create adds a source at the end of the list, or just before "Other" when
// "Other" is last.
func (s IncomeSources) Create(ctx context.Context, userID int64, name string) (IncomeSource, error) {
	name, err := cleanName(name)
	if err != nil {
		return IncomeSource{}, err
	}

	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return IncomeSource{}, err
	}
	defer tx.Rollback()

	if err := checkNameFree(ctx, tx, "income_sources", userID, name, 0); err != nil {
		return IncomeSource{}, err
	}
	sort, err := nextSortOrder(ctx, tx, "income_sources", userID)
	if err != nil {
		return IncomeSource{}, err
	}
	res, err := tx.ExecContext(ctx,
		`INSERT INTO income_sources (user_id, name, sort_order) VALUES (?, ?, ?)`, userID, name, sort)
	if err != nil {
		return IncomeSource{}, mapConstraint(err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return IncomeSource{}, err
	}
	src, err := getIncomeSource(ctx, tx, userID, id)
	if err != nil {
		return IncomeSource{}, err
	}
	return src, tx.Commit()
}

// Rename renames a source, whether or not it has entries. Renaming "Other"
// returns ErrProtected.
func (s IncomeSources) Rename(ctx context.Context, userID, id int64, name string) (IncomeSource, error) {
	name, err := cleanName(name)
	if err != nil {
		return IncomeSource{}, err
	}

	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return IncomeSource{}, err
	}
	defer tx.Rollback()

	cur, err := getIncomeSource(ctx, tx, userID, id)
	if err != nil {
		return IncomeSource{}, err
	}
	if cur.IsProtected {
		return IncomeSource{}, ErrProtected
	}
	if err := checkNameFree(ctx, tx, "income_sources", userID, name, id); err != nil {
		return IncomeSource{}, err
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE income_sources SET name = ?, updated_at = `+nowSQL+` WHERE id = ? AND user_id = ?`,
		name, id, userID); err != nil {
		return IncomeSource{}, mapConstraint(err)
	}
	src, err := getIncomeSource(ctx, tx, userID, id)
	if err != nil {
		return IncomeSource{}, err
	}
	return src, tx.Commit()
}

// Reorder sets sort_order for the whole list. ids must name every one of the
// user's sources exactly once ("Other" included).
func (s IncomeSources) Reorder(ctx context.Context, userID int64, ids []int64) ([]IncomeSource, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	current, err := listIncomeSources(ctx, tx, userID)
	if err != nil {
		return nil, err
	}
	have := make([]int64, len(current))
	for i, src := range current {
		have[i] = src.ID
	}
	if err := applyOrder(ctx, tx, "income_sources", userID, have, ids, "income source"); err != nil {
		return nil, err
	}
	out, err := listIncomeSources(ctx, tx, userID)
	if err != nil {
		return nil, err
	}
	return out, tx.Commit()
}

// Delete removes a source that has no income entries, moving its template
// items to "Other" in the same transaction. Deleting "Other" returns
// ErrProtected; a source with entries returns ErrSourceHasEntries.
func (s IncomeSources) Delete(ctx context.Context, userID, id int64) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	cur, err := getIncomeSource(ctx, tx, userID, id)
	if err != nil {
		return err
	}
	switch {
	case cur.IsProtected:
		return ErrProtected
	case cur.HasEntries:
		return ErrSourceHasEntries
	}
	var otherID int64
	if err := tx.QueryRowContext(ctx,
		`SELECT id FROM income_sources WHERE user_id = ? AND is_protected = 1`, userID).Scan(&otherID); err != nil {
		return err
	}
	// The income_sources_reassign_template_items trigger would do this too;
	// doing it here keeps the rule visible and the trigger a safety net.
	if _, err := tx.ExecContext(ctx,
		`UPDATE template_income_items SET income_source_id = ? WHERE user_id = ? AND income_source_id = ?`,
		otherID, userID, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM income_sources WHERE id = ? AND user_id = ?`, id, userID); err != nil {
		return mapConstraint(err)
	}
	return tx.Commit()
}

func listIncomeSources(ctx context.Context, q querier, userID int64) ([]IncomeSource, error) {
	rows, err := q.QueryContext(ctx,
		`SELECT `+incomeSourceCols+` FROM income_sources s WHERE s.user_id = ? ORDER BY s.sort_order, s.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []IncomeSource{}
	for rows.Next() {
		src, err := scanIncomeSource(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, src)
	}
	return out, rows.Err()
}

func getIncomeSource(ctx context.Context, q querier, userID, id int64) (IncomeSource, error) {
	src, err := scanIncomeSource(q.QueryRowContext(ctx,
		`SELECT `+incomeSourceCols+` FROM income_sources s WHERE s.id = ? AND s.user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return IncomeSource{}, ErrNotFound
	}
	return src, err
}

func scanIncomeSource(s interface{ Scan(...any) error }) (IncomeSource, error) {
	var (
		src              IncomeSource
		created, updated string
	)
	if err := s.Scan(&src.ID, &src.Name, &src.IsProtected, &src.SortOrder, &created, &updated, &src.HasEntries); err != nil {
		return IncomeSource{}, err
	}
	var err error
	if src.CreatedAt, err = parseTS(created); err != nil {
		return IncomeSource{}, err
	}
	if src.UpdatedAt, err = parseTS(updated); err != nil {
		return IncomeSource{}, err
	}
	return src, nil
}

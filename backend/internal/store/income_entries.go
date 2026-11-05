package store

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"
)

// IncomeEntry is an income_entries row: one paycheck or one-off job. The tax
// rate is derived by clients from these figures and never stored.
type IncomeEntry struct {
	ID                int64
	SourceID          int64
	Date              string // YYYY-MM-DD
	GrossCents        int64
	GrossTaxableCents int64
	NetCents          int64
	Note              *string
	Confirmed         bool
	TemplateApplyID   *int64
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// NewIncomeEntry is the input to IncomeEntries.Create.
type NewIncomeEntry struct {
	SourceID          int64
	Date              string
	GrossCents        int64
	GrossTaxableCents int64
	NetCents          int64
	Note              *string
	Confirmed         bool
}

// IncomeEntryPatch is a partial update. A nil field is left unchanged; SetNote
// with a nil Note clears the note.
type IncomeEntryPatch struct {
	SourceID          *int64
	Date              *string
	GrossCents        *int64
	GrossTaxableCents *int64
	NetCents          *int64
	SetNote           bool
	Note              *string
	// Confirmed defaults to true: editing an unconfirmed entry confirms it
	// unless the patch says otherwise.
	Confirmed *bool
}

// IncomeEntryFilter selects entries to list. Month cannot be combined with
// From/To. Zero values mean no filter.
type IncomeEntryFilter struct {
	Month     string // YYYY-MM
	From, To  string // inclusive YYYY-MM-DD bounds
	SourceID  *int64
	Confirmed *bool
}

// IncomeEntries reads and writes the income_entries table. Every method is
// scoped to the given user; another user's entries behave as if they do not
// exist.
type IncomeEntries struct{ DB *sql.DB }

const incomeEntryCols = `id, income_source_id, received_on, gross_cents, gross_taxable_cents, net_cents,
	note, confirmed, template_apply_id, created_at, updated_at`

// Get returns one of the user's entries.
func (s IncomeEntries) Get(ctx context.Context, userID, id int64) (IncomeEntry, error) {
	return getIncomeEntry(ctx, s.DB, userID, id)
}

// List returns the user's entries matching f, sorted by date descending and
// then newest first, one page at a time. The second result is the cursor for
// the next page ("" on the last one).
func (s IncomeEntries) List(ctx context.Context, userID int64, f IncomeEntryFilter, page Page) ([]IncomeEntry, string, error) {
	limit, err := page.limit()
	if err != nil {
		return nil, "", err
	}
	from, to, err := dateBounds(f.Month, f.From, f.To)
	if err != nil {
		return nil, "", err
	}
	where := []string{"user_id = ?"}
	args := []any{userID}
	if from != "" {
		where = append(where, "received_on >= ?")
		args = append(args, from)
	}
	if to != "" {
		where = append(where, "received_on <= ?")
		args = append(args, to)
	}
	if f.SourceID != nil {
		where = append(where, "income_source_id = ?")
		args = append(args, *f.SourceID)
	}
	if f.Confirmed != nil {
		where = append(where, "confirmed = ?")
		args = append(args, *f.Confirmed)
	}
	if page.Cursor != "" {
		parts, err := decodeCursor(page.Cursor, 2)
		if err != nil {
			return nil, "", err
		}
		lastID, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil {
			return nil, "", invalid("cursor", "is not valid")
		}
		where = append(where, "(received_on < ? OR (received_on = ? AND id < ?))")
		args = append(args, parts[0], parts[0], lastID)
	}
	args = append(args, limit+1)

	rows, err := s.DB.QueryContext(ctx,
		`SELECT `+incomeEntryCols+` FROM income_entries WHERE `+strings.Join(where, " AND ")+
			` ORDER BY received_on DESC, id DESC LIMIT ?`, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	out := []IncomeEntry{}
	for rows.Next() {
		e, err := scanIncomeEntry(rows)
		if err != nil {
			return nil, "", err
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}
	next := ""
	if len(out) > limit {
		out = out[:limit]
		last := out[limit-1]
		next = encodeCursor(last.Date, strconv.FormatInt(last.ID, 10))
	}
	return out, next, nil
}

// Create adds an entry. The source must be one of the user's.
func (s IncomeEntries) Create(ctx context.Context, userID int64, n NewIncomeEntry) (IncomeEntry, error) {
	note, err := cleanNote(n.Note)
	if err != nil {
		return IncomeEntry{}, err
	}
	if err := checkDate(n.Date, "date"); err != nil {
		return IncomeEntry{}, err
	}
	if err := checkIncomeFigures(n.GrossCents, n.GrossTaxableCents, n.NetCents); err != nil {
		return IncomeEntry{}, err
	}

	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return IncomeEntry{}, err
	}
	defer tx.Rollback()

	if err := checkSourceOwned(ctx, tx, userID, n.SourceID); err != nil {
		return IncomeEntry{}, err
	}
	res, err := tx.ExecContext(ctx,
		`INSERT INTO income_entries (user_id, income_source_id, received_on, gross_cents, gross_taxable_cents, net_cents, note, confirmed)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		userID, n.SourceID, n.Date, n.GrossCents, n.GrossTaxableCents, n.NetCents, note, n.Confirmed)
	if err != nil {
		return IncomeEntry{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return IncomeEntry{}, err
	}
	e, err := getIncomeEntry(ctx, tx, userID, id)
	if err != nil {
		return IncomeEntry{}, err
	}
	return e, tx.Commit()
}

// Update applies a partial update. The resulting entry must still have
// taxable <= gross and net <= gross. It also confirms the entry unless the
// patch sets Confirmed to false.
func (s IncomeEntries) Update(ctx context.Context, userID, id int64, p IncomeEntryPatch) (IncomeEntry, error) {
	if p.SourceID == nil && p.Date == nil && p.GrossCents == nil && p.GrossTaxableCents == nil &&
		p.NetCents == nil && !p.SetNote && p.Confirmed == nil {
		return IncomeEntry{}, invalid("body", "must set at least one field")
	}
	if p.Date != nil {
		if err := checkDate(*p.Date, "date"); err != nil {
			return IncomeEntry{}, err
		}
	}

	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return IncomeEntry{}, err
	}
	defer tx.Rollback()

	e, err := getIncomeEntry(ctx, tx, userID, id)
	if err != nil {
		return IncomeEntry{}, err
	}
	if p.SourceID != nil {
		if err := checkSourceOwned(ctx, tx, userID, *p.SourceID); err != nil {
			return IncomeEntry{}, err
		}
		e.SourceID = *p.SourceID
	}
	if p.Date != nil {
		e.Date = *p.Date
	}
	if p.GrossCents != nil {
		e.GrossCents = *p.GrossCents
	}
	if p.GrossTaxableCents != nil {
		e.GrossTaxableCents = *p.GrossTaxableCents
	}
	if p.NetCents != nil {
		e.NetCents = *p.NetCents
	}
	if p.SetNote {
		if e.Note, err = cleanNote(p.Note); err != nil {
			return IncomeEntry{}, err
		}
	}
	e.Confirmed = true
	if p.Confirmed != nil {
		e.Confirmed = *p.Confirmed
	}
	if err := checkIncomeFigures(e.GrossCents, e.GrossTaxableCents, e.NetCents); err != nil {
		return IncomeEntry{}, err
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE income_entries SET income_source_id = ?, received_on = ?, gross_cents = ?, gross_taxable_cents = ?,
		 net_cents = ?, note = ?, confirmed = ?, updated_at = `+nowSQL+` WHERE id = ? AND user_id = ?`,
		e.SourceID, e.Date, e.GrossCents, e.GrossTaxableCents, e.NetCents, e.Note, e.Confirmed, id, userID); err != nil {
		return IncomeEntry{}, err
	}
	out, err := getIncomeEntry(ctx, tx, userID, id)
	if err != nil {
		return IncomeEntry{}, err
	}
	return out, tx.Commit()
}

// Delete removes one of the user's entries.
func (s IncomeEntries) Delete(ctx context.Context, userID, id int64) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM income_entries WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func getIncomeEntry(ctx context.Context, q querier, userID, id int64) (IncomeEntry, error) {
	e, err := scanIncomeEntry(q.QueryRowContext(ctx,
		`SELECT `+incomeEntryCols+` FROM income_entries WHERE id = ? AND user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return IncomeEntry{}, ErrNotFound
	}
	return e, err
}

func scanIncomeEntry(s interface{ Scan(...any) error }) (IncomeEntry, error) {
	var (
		e                IncomeEntry
		note             sql.NullString
		apply            sql.NullInt64
		created, updated string
	)
	if err := s.Scan(&e.ID, &e.SourceID, &e.Date, &e.GrossCents, &e.GrossTaxableCents, &e.NetCents,
		&note, &e.Confirmed, &apply, &created, &updated); err != nil {
		return IncomeEntry{}, err
	}
	if note.Valid {
		e.Note = &note.String
	}
	if apply.Valid {
		e.TemplateApplyID = &apply.Int64
	}
	var err error
	if e.CreatedAt, err = parseTS(created); err != nil {
		return IncomeEntry{}, err
	}
	if e.UpdatedAt, err = parseTS(updated); err != nil {
		return IncomeEntry{}, err
	}
	return e, nil
}

// checkSourceOwned reports a source that is not one of the user's as an
// invalid field, so another user's source looks like one that does not exist.
func checkSourceOwned(ctx context.Context, q querier, userID, sourceID int64) error {
	var one int
	err := q.QueryRowContext(ctx,
		`SELECT 1 FROM income_sources WHERE id = ? AND user_id = ?`, sourceID, userID).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return invalid("income_source_id", "is not one of your income sources")
	}
	return err
}

func checkIncomeFigures(gross, taxable, net int64) error {
	switch {
	case gross < 0:
		return invalid("gross_cents", "must be >= 0")
	case taxable < 0:
		return invalid("gross_taxable_cents", "must be >= 0")
	case net < 0:
		return invalid("net_cents", "must be >= 0")
	case taxable > gross:
		return invalid("gross_taxable_cents", "must be <= gross_cents")
	case net > gross:
		return invalid("net_cents", "must be <= gross_cents")
	}
	return nil
}

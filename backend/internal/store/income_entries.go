package store

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
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

// IncomeEntryFilter selects entries for List. A nil field is no filter.
// Month and From/To are mutually exclusive.
type IncomeEntryFilter struct {
	Month     *string // YYYY-MM
	From, To  *string // inclusive YYYY-MM-DD
	SourceID  *int64
	Confirmed *bool
	Limit     *int // nil means DefaultListLimit
	Cursor    *string
}

// IncomeEntryPage is one page of List, newest first. NextCursor is nil on the
// last page.
type IncomeEntryPage struct {
	Items      []IncomeEntry
	NextCursor *string
}

const (
	// DefaultListLimit and MaxListLimit bound a page of a paginated list.
	DefaultListLimit = 200
	MaxListLimit     = 1000
	maxNoteLen       = 500
	dateLayout       = "2006-01-02"
)

var monthRE = regexp.MustCompile(`^[0-9]{4}-(0[1-9]|1[0-2])$`)

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

// List returns a page of the user's entries matching f, sorted by date
// descending (newest id first within a day).
func (s IncomeEntries) List(ctx context.Context, userID int64, f IncomeEntryFilter) (IncomeEntryPage, error) {
	where := []string{"user_id = ?"}
	args := []any{userID}

	if f.Month != nil {
		if f.From != nil || f.To != nil {
			return IncomeEntryPage{}, invalid("month", "cannot be combined with from or to")
		}
		if !monthRE.MatchString(*f.Month) {
			return IncomeEntryPage{}, invalid("month", "must look like YYYY-MM")
		}
		// Dates are YYYY-MM-DD text, so a month is a lexical range.
		where = append(where, "received_on BETWEEN ? AND ?")
		args = append(args, *f.Month+"-01", *f.Month+"-31")
	}
	if f.From != nil {
		if err := checkDate("from", *f.From); err != nil {
			return IncomeEntryPage{}, err
		}
		where = append(where, "received_on >= ?")
		args = append(args, *f.From)
	}
	if f.To != nil {
		if err := checkDate("to", *f.To); err != nil {
			return IncomeEntryPage{}, err
		}
		where = append(where, "received_on <= ?")
		args = append(args, *f.To)
	}
	if f.From != nil && f.To != nil && *f.From > *f.To {
		return IncomeEntryPage{}, invalid("from", "must be on or before to")
	}
	if f.SourceID != nil {
		where = append(where, "income_source_id = ?")
		args = append(args, *f.SourceID)
	}
	if f.Confirmed != nil {
		where = append(where, "confirmed = ?")
		args = append(args, *f.Confirmed)
	}

	limit := DefaultListLimit
	if f.Limit != nil {
		limit = *f.Limit
		if limit < 1 || limit > MaxListLimit {
			return IncomeEntryPage{}, invalid("limit", "must be between 1 and "+strconv.Itoa(MaxListLimit))
		}
	}
	if f.Cursor != nil {
		date, id, ok := decodeCursor(*f.Cursor)
		if !ok {
			return IncomeEntryPage{}, invalid("cursor", "is not a cursor from this list")
		}
		where = append(where, "(received_on < ? OR (received_on = ? AND id < ?))")
		args = append(args, date, date, id)
	}
	args = append(args, limit+1)

	rows, err := s.DB.QueryContext(ctx,
		`SELECT `+incomeEntryCols+` FROM income_entries WHERE `+strings.Join(where, " AND ")+
			` ORDER BY received_on DESC, id DESC LIMIT ?`, args...)
	if err != nil {
		return IncomeEntryPage{}, err
	}
	defer rows.Close()
	page := IncomeEntryPage{Items: []IncomeEntry{}}
	for rows.Next() {
		e, err := scanIncomeEntry(rows)
		if err != nil {
			return IncomeEntryPage{}, err
		}
		page.Items = append(page.Items, e)
	}
	if err := rows.Err(); err != nil {
		return IncomeEntryPage{}, err
	}
	if len(page.Items) > limit {
		page.Items = page.Items[:limit]
		last := page.Items[limit-1]
		c := encodeCursor(last.Date, last.ID)
		page.NextCursor = &c
	}
	return page, nil
}

// Create adds an entry. The source must be one of the user's.
func (s IncomeEntries) Create(ctx context.Context, userID int64, n NewIncomeEntry) (IncomeEntry, error) {
	note, err := cleanNote(n.Note)
	if err != nil {
		return IncomeEntry{}, err
	}
	if err := checkDate("date", n.Date); err != nil {
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
		if err := checkDate("date", *p.Date); err != nil {
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

func checkDate(field, s string) error {
	if _, err := time.Parse(dateLayout, s); err != nil {
		return invalid(field, "must be a date like YYYY-MM-DD")
	}
	return nil
}

// cleanNote trims a note; an empty note is stored as NULL.
func cleanNote(n *string) (*string, error) {
	if n == nil {
		return nil, nil
	}
	s := strings.TrimSpace(*n)
	if s == "" {
		return nil, nil
	}
	if utf8.RuneCountInString(s) > maxNoteLen {
		return nil, invalid("note", "must be at most "+strconv.Itoa(maxNoteLen)+" characters")
	}
	return &s, nil
}

// A cursor is the (date, id) of the last row on the previous page. It is
// opaque to clients.
func encodeCursor(date string, id int64) string {
	return base64.RawURLEncoding.EncodeToString([]byte(date + "/" + strconv.FormatInt(id, 10)))
}

func decodeCursor(c string) (string, int64, bool) {
	b, err := base64.RawURLEncoding.DecodeString(c)
	if err != nil {
		return "", 0, false
	}
	date, rawID, ok := strings.Cut(string(b), "/")
	if !ok || checkDate("cursor", date) != nil {
		return "", 0, false
	}
	id, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || id < 1 {
		return "", 0, false
	}
	return date, id, true
}

package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// Import statuses, matching the imports.status column and the spec's
// ImportStatus.
const (
	ImportReview    = "review"
	ImportRunning   = "running"
	ImportCompleted = "completed"
	ImportCancelled = "cancelled"
	ImportFailed    = "failed"
	ImportUndone    = "undone"
	ImportExpired   = "expired"
)

// Import sheets.
const (
	SheetExpenses = "expenses"
	SheetIncome   = "income"
)

// ReviewTTL is how long a checked import waits for the user to start it.
const ReviewTTL = 24 * time.Hour

// ErrImportNotInReview: the import has already been started, finished or
// expired, so it cannot be discarded.
var ErrImportNotInReview = errors.New("import is not in review")

// Import is an imports row. EntriesImported, FirstMonth and LastMonth are
// read from the entry tables and import_rows, never stored.
type Import struct {
	ID               int64
	FileName         string
	Status           string
	ExpenseRows      int
	IncomeRows       int
	RowsReady        int
	RowsWithProblems int
	RowsDone         int
	FailureReason    *string
	CreatedAt        time.Time
	FinishedAt       *time.Time
	EntriesImported  int     // entries with this import_id currently in the app
	FirstMonth       *string // YYYY-MM, earliest ready row; nil when none
	LastMonth        *string // YYYY-MM, latest ready row
}

// ImportRow is one checked data row. Ready rows carry parsed values (cents);
// rows with problems carry Original, the cells as text, for the problem
// download.
type ImportRow struct {
	Sheet     string // SheetExpenses or SheetIncome
	RowNumber int    // Excel row; row 1 is the header
	Ready     bool
	Date      *string // YYYY-MM-DD
	Category  *string
	Merchant  *string
	Source    *string
	Amount    *int64 // expenses
	Gross     *int64 // income
	Taxable   *int64
	Net       *int64
	Note      *string
	Original  *string // JSON array of the row's cells as text
}

// ImportIssue is one problem found in a row.
type ImportIssue struct {
	Sheet     string
	RowNumber int
	Column    string
	Code      string
	Value     string
	Message   string
}

// NewImport is the input to Imports.Create: the file name and what the server
// found. Counts are derived from Rows.
type NewImport struct {
	FileName string
	Rows     []ImportRow
	Issues   []ImportIssue
}

// ImportFilter selects imports to list. Zero values mean no filter.
type ImportFilter struct {
	Status string
}

// Imports reads and writes imports, their checked rows and their issues.
// Every method is scoped to the given user; another user's imports behave as
// if they do not exist.
type Imports struct{ DB *sql.DB }

const importCols = `i.id, i.file_name, i.status, i.expense_rows, i.income_rows, i.rows_ready,
	i.rows_with_problems, i.rows_done, i.failure_reason, i.created_at, i.finished_at,
	(SELECT count(*) FROM expenses e WHERE e.import_id = i.id AND e.user_id = i.user_id)
	  + (SELECT count(*) FROM income_entries n WHERE n.import_id = i.id AND n.user_id = i.user_id),
	(SELECT substr(min(r.occurred_on), 1, 7) FROM import_rows r
	  WHERE r.import_id = i.id AND r.user_id = i.user_id AND r.ready = 1),
	(SELECT substr(max(r.occurred_on), 1, 7) FROM import_rows r
	  WHERE r.import_id = i.id AND r.user_id = i.user_id AND r.ready = 1)`

// Create stores a checked file in status review: the import, all its rows and
// all its issues, in one transaction. Nothing is added to the user's entries.
func (x Imports) Create(ctx context.Context, userID int64, in NewImport) (Import, error) {
	if in.FileName == "" {
		return Import{}, invalid("file_name", "must not be empty")
	}
	var expenseRows, incomeRows, ready int
	type key struct {
		sheet string
		row   int
	}
	seen := make(map[key]bool, len(in.Rows))
	for _, r := range in.Rows {
		if r.Sheet != SheetExpenses && r.Sheet != SheetIncome {
			return Import{}, invalid("rows", "has an unknown sheet")
		}
		if r.RowNumber < 2 || seen[key{r.Sheet, r.RowNumber}] {
			return Import{}, invalid("rows", "has a bad or repeated row number")
		}
		seen[key{r.Sheet, r.RowNumber}] = true
		if r.Sheet == SheetExpenses {
			expenseRows++
		} else {
			incomeRows++
		}
		if r.Ready {
			ready++
		}
	}
	for _, is := range in.Issues {
		if !seen[key{is.Sheet, is.RowNumber}] {
			return Import{}, invalid("issues", "names a row that was not checked")
		}
	}

	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return Import{}, err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, `INSERT INTO imports
		(user_id, file_name, expense_rows, income_rows, rows_ready, rows_with_problems)
		VALUES (?, ?, ?, ?, ?, ?)`,
		userID, in.FileName, expenseRows, incomeRows, ready, expenseRows+incomeRows-ready)
	if err != nil {
		return Import{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Import{}, err
	}

	rowStmt, err := tx.PrepareContext(ctx, `INSERT INTO import_rows
		(import_id, user_id, sheet, row_number, ready, occurred_on, category, merchant, source,
		 amount_cents, gross_cents, gross_taxable_cents, net_cents, note, original)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return Import{}, err
	}
	defer rowStmt.Close()
	for _, r := range in.Rows {
		if _, err := rowStmt.ExecContext(ctx, id, userID, r.Sheet, r.RowNumber, r.Ready, r.Date,
			r.Category, r.Merchant, r.Source, r.Amount, r.Gross, r.Taxable, r.Net, r.Note,
			r.Original); err != nil {
			return Import{}, err
		}
	}
	issueStmt, err := tx.PrepareContext(ctx, `INSERT INTO import_issues
		(import_id, user_id, sheet, row_number, column_name, code, value, message)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return Import{}, err
	}
	defer issueStmt.Close()
	for _, is := range in.Issues {
		if _, err := issueStmt.ExecContext(ctx, id, userID, is.Sheet, is.RowNumber, is.Column,
			is.Code, is.Value, is.Message); err != nil {
			return Import{}, err
		}
	}

	imp, err := getImport(ctx, tx, userID, id)
	if err != nil {
		return Import{}, err
	}
	return imp, tx.Commit()
}

// Get returns one of the user's imports.
func (x Imports) Get(ctx context.Context, userID, id int64) (Import, error) {
	return getImport(ctx, x.DB, userID, id)
}

// List returns the user's imports, newest first, optionally of one status.
func (x Imports) List(ctx context.Context, userID int64, f ImportFilter) ([]Import, error) {
	q := `SELECT ` + importCols + ` FROM imports i WHERE i.user_id = ?`
	args := []any{userID}
	if f.Status != "" {
		switch f.Status {
		case ImportReview, ImportRunning, ImportCompleted, ImportCancelled, ImportFailed, ImportUndone, ImportExpired:
		default:
			return nil, invalid("status", "is not a known import status")
		}
		q += ` AND i.status = ?`
		args = append(args, f.Status)
	}
	rows, err := x.DB.QueryContext(ctx, q+` ORDER BY i.created_at DESC, i.id DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Import{}
	for rows.Next() {
		imp, err := scanImport(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, imp)
	}
	return out, rows.Err()
}

// Issues returns up to limit of the import's issues in sheet and row order
// (limit <= 0 means all), and whether more exist.
func (x Imports) Issues(ctx context.Context, userID, id int64, limit int) ([]ImportIssue, bool, error) {
	if _, err := getImport(ctx, x.DB, userID, id); err != nil {
		return nil, false, err
	}
	q := `SELECT sheet, row_number, column_name, code, value, message FROM import_issues
		WHERE import_id = ? AND user_id = ? ORDER BY sheet, row_number, id`
	args := []any{id, userID}
	if limit > 0 {
		q += ` LIMIT ?`
		args = append(args, limit+1)
	}
	rows, err := x.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	out := []ImportIssue{}
	for rows.Next() {
		var is ImportIssue
		if err := rows.Scan(&is.Sheet, &is.RowNumber, &is.Column, &is.Code, &is.Value, &is.Message); err != nil {
			return nil, false, err
		}
		out = append(out, is)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	more := limit > 0 && len(out) > limit
	if more {
		out = out[:limit]
	}
	return out, more, nil
}

// Rows returns the import's checked rows that are ready (the ones that will
// be imported, oldest first) or, with ready false, the rows with problems in
// sheet and row order.
func (x Imports) Rows(ctx context.Context, userID, id int64, ready bool) ([]ImportRow, error) {
	if _, err := getImport(ctx, x.DB, userID, id); err != nil {
		return nil, err
	}
	rows, err := x.DB.QueryContext(ctx, `SELECT sheet, row_number, ready, occurred_on, category, merchant,
			source, amount_cents, gross_cents, gross_taxable_cents, net_cents, note, original
		FROM import_rows WHERE import_id = ? AND user_id = ? AND ready = ?
		ORDER BY CASE WHEN ready = 1 THEN occurred_on END, sheet, row_number`, id, userID, ready)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ImportRow{}
	for rows.Next() {
		var (
			r                         ImportRow
			date, cat, mer, src, note sql.NullString
			orig                      sql.NullString
			amount, gross, tax, net   sql.NullInt64
		)
		if err := rows.Scan(&r.Sheet, &r.RowNumber, &r.Ready, &date, &cat, &mer, &src,
			&amount, &gross, &tax, &net, &note, &orig); err != nil {
			return nil, err
		}
		r.Date, r.Category, r.Merchant, r.Source = strPtr(date), strPtr(cat), strPtr(mer), strPtr(src)
		r.Amount, r.Gross, r.Taxable, r.Net = intPtr(amount), intPtr(gross), intPtr(tax), intPtr(net)
		r.Note, r.Original = strPtr(note), strPtr(orig)
		out = append(out, r)
	}
	return out, rows.Err()
}

// Discard deletes an import still in review, with its rows and issues.
func (x Imports) Discard(ctx context.Context, userID, id int64) error {
	res, err := x.DB.ExecContext(ctx,
		`DELETE FROM imports WHERE id = ? AND user_id = ? AND status = ?`, id, userID, ImportReview)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err != nil {
		return err
	} else if n == 1 {
		return nil
	}
	if _, err := getImport(ctx, x.DB, userID, id); err != nil {
		return err
	}
	return ErrImportNotInReview
}

// ExpireStale marks the user's review imports created before now-ReviewTTL as
// expired and drops their rows and issues. It returns how many it expired.
func (x Imports) ExpireStale(ctx context.Context, userID int64, now time.Time) (int, error) {
	return expireStale(ctx, x.DB, &userID, now)
}

// ExpireAllStale does the same for every user. It is for the background
// sweep, not for request handlers.
func (x Imports) ExpireAllStale(ctx context.Context, now time.Time) (int, error) {
	return expireStale(ctx, x.DB, nil, now)
}

func expireStale(ctx context.Context, db *sql.DB, userID *int64, now time.Time) (int, error) {
	cutoff := now.Add(-ReviewTTL).UTC().Format("2006-01-02T15:04:05.000Z")
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	scope, args := ``, []any{ImportReview, cutoff}
	if userID != nil {
		scope, args = ` AND user_id = ?`, append(args, *userID)
	}
	stale := `SELECT id FROM imports WHERE status = ? AND created_at < ?` + scope
	for _, t := range []string{"import_issues", "import_rows"} {
		if _, err := tx.ExecContext(ctx, `DELETE FROM `+t+` WHERE import_id IN (`+stale+`)`, args...); err != nil {
			return 0, err
		}
	}
	res, err := tx.ExecContext(ctx, `UPDATE imports SET status = 'expired', finished_at = `+nowSQL+
		` WHERE status = ? AND created_at < ?`+scope, args...)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, err
	}
	return int(n), tx.Commit()
}

// DeleteEntries deletes every expense and income entry with this import_id in
// one transaction, edited or not, and returns how many it deleted. Refunds
// that pointed at a deleted expense are unlinked (not deleted), as when
// deleting an expense by hand. Entries without the import_id are never
// touched. The caller sets the import's status.
func (x Imports) DeleteEntries(ctx context.Context, userID, id int64) (int, error) {
	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	if _, err := getImport(ctx, tx, userID, id); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE expenses
		SET refunded_expense_id = NULL, updated_at = `+nowSQL+`
		WHERE user_id = ? AND refunded_expense_id IN
		  (SELECT id FROM expenses WHERE user_id = ? AND import_id = ?)`, userID, userID, id); err != nil {
		return 0, err
	}
	total := 0
	for _, t := range []string{"expenses", "income_entries"} {
		res, err := tx.ExecContext(ctx, `DELETE FROM `+t+` WHERE user_id = ? AND import_id = ?`, userID, id)
		if err != nil {
			return 0, mapConstraint(err)
		}
		n, err := res.RowsAffected()
		if err != nil {
			return 0, err
		}
		total += int(n)
	}
	return total, tx.Commit()
}

func getImport(ctx context.Context, q querier, userID, id int64) (Import, error) {
	imp, err := scanImport(q.QueryRowContext(ctx,
		`SELECT `+importCols+` FROM imports i WHERE i.id = ? AND i.user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return Import{}, ErrNotFound
	}
	return imp, err
}

func scanImport(s interface{ Scan(...any) error }) (Import, error) {
	var (
		imp         Import
		reason, fin sql.NullString
		first, last sql.NullString
		created     string
	)
	if err := s.Scan(&imp.ID, &imp.FileName, &imp.Status, &imp.ExpenseRows, &imp.IncomeRows,
		&imp.RowsReady, &imp.RowsWithProblems, &imp.RowsDone, &reason, &created, &fin,
		&imp.EntriesImported, &first, &last); err != nil {
		return Import{}, err
	}
	imp.FailureReason, imp.FirstMonth, imp.LastMonth = strPtr(reason), strPtr(first), strPtr(last)
	var err error
	if imp.CreatedAt, err = parseTS(created); err != nil {
		return Import{}, err
	}
	if fin.Valid {
		t, err := parseTS(fin.String)
		if err != nil {
			return Import{}, err
		}
		imp.FinishedAt = &t
	}
	return imp, nil
}

func strPtr(s sql.NullString) *string {
	if !s.Valid {
		return nil
	}
	return &s.String
}

func intPtr(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	return &n.Int64
}

// ImportYear is one row of the review table: the file's ready rows in a
// calendar year. RowsWithProblems counts problem rows whose date could be
// read; rows with an unreadable date belong to no year.
type ImportYear struct {
	Year             int
	Months           int // months with at least one ready row
	ExpenseRows      int
	IncomeRows       int
	SpentCents       int64 // ready expense amounts, refunds lowering it
	RowsWithProblems int
}

// ImportMonth is a month in the file that already has entries in the app.
type ImportMonth struct {
	Month           string // YYYY-MM
	ExistingEntries int    // expenses and income entries already there
	FileEntries     int    // ready rows in the file for this month
}

// Years returns the per-year review table, oldest first.
func (x Imports) Years(ctx context.Context, userID, id int64) ([]ImportYear, error) {
	if _, err := getImport(ctx, x.DB, userID, id); err != nil {
		return nil, err
	}
	rows, err := x.DB.QueryContext(ctx, `SELECT CAST(substr(occurred_on, 1, 4) AS INTEGER),
			count(DISTINCT CASE WHEN ready = 1 THEN substr(occurred_on, 1, 7) END),
			coalesce(sum(ready = 1 AND sheet = 'expenses'), 0),
			coalesce(sum(ready = 1 AND sheet = 'income'), 0),
			coalesce(sum(CASE WHEN ready = 1 AND sheet = 'expenses' THEN amount_cents END), 0),
			coalesce(sum(ready = 0), 0)
		FROM import_rows WHERE import_id = ? AND user_id = ? AND occurred_on IS NOT NULL
		GROUP BY 1 ORDER BY 1`, id, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ImportYear{}
	for rows.Next() {
		var y ImportYear
		if err := rows.Scan(&y.Year, &y.Months, &y.ExpenseRows, &y.IncomeRows, &y.SpentCents, &y.RowsWithProblems); err != nil {
			return nil, err
		}
		out = append(out, y)
	}
	return out, rows.Err()
}

// ExistingMonths returns the months of the file's ready rows that already have
// expenses or income entries (not counting entries this import added),
// oldest first.
func (x Imports) ExistingMonths(ctx context.Context, userID, id int64) ([]ImportMonth, error) {
	if _, err := getImport(ctx, x.DB, userID, id); err != nil {
		return nil, err
	}
	rows, err := x.DB.QueryContext(ctx, `WITH f AS (
			SELECT substr(occurred_on, 1, 7) AS m, count(*) AS n FROM import_rows
			WHERE import_id = ? AND user_id = ? AND ready = 1 GROUP BY 1)
		SELECT m, n, existing FROM (
			SELECT f.m AS m, f.n AS n,
			  (SELECT count(*) FROM expenses e WHERE e.user_id = ? AND e.import_id IS NOT ?
			     AND e.occurred_on >= f.m || '-01' AND e.occurred_on <= f.m || '-31')
			  + (SELECT count(*) FROM income_entries i WHERE i.user_id = ? AND i.import_id IS NOT ?
			     AND i.received_on >= f.m || '-01' AND i.received_on <= f.m || '-31') AS existing
			FROM f)
		WHERE existing > 0 ORDER BY m`, id, userID, userID, id, userID, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ImportMonth{}
	for rows.Next() {
		var m ImportMonth
		if err := rows.Scan(&m.Month, &m.FileEntries, &m.ExistingEntries); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

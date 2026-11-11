package store

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Expense is an expenses row with its merchant. A negative amount is a
// refund.
type Expense struct {
	ID                 int64
	Date               string // YYYY-MM-DD
	AmountCents        int64
	Type               string // TypeExpense or TypeRefund, derived from the amount's sign
	CategoryID         int64
	Merchant           Merchant
	Note               *string
	RefundedExpenseID  *int64
	RefundedTotalCents int64   // sum of refunds linked to this expense (<= 0); never stored
	LastRefundDate     *string // date of the latest linked refund (YYYY-MM-DD); never stored
	Confirmed          bool
	TemplateApplyID    *int64
	ImportID           *int64 // the import that created it, if any
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

// Expense types, matching the generated expenses.type column.
const (
	TypeExpense = "expense"
	TypeRefund  = "refund"
)

// NewExpense is the input for creating an expense or refund.
type NewExpense struct {
	Date              string // YYYY-MM-DD
	AmountCents       int64  // non-zero; negative for a refund
	CategoryID        int64
	MerchantName      string // matched case-insensitively, or created
	Note              *string
	RefundedExpenseID *int64 // only on a refund
	Confirmed         bool
}

// ExpensePatch is a partial update. Nil fields are left unchanged. Note and
// RefundedExpenseID are applied only when their Set flag is true (nil then
// clears them).
type ExpensePatch struct {
	Date                 *string
	AmountCents          *int64
	CategoryID           *int64
	MerchantName         *string
	SetNote              bool
	Note                 *string
	SetRefundedExpenseID bool
	RefundedExpenseID    *int64
	Confirmed            *bool
}

// ExpenseFilter selects expenses to list. Month cannot be combined with
// From/To. Zero values mean no filter.
type ExpenseFilter struct {
	Month      string // YYYY-MM
	From, To   string // inclusive YYYY-MM-DD bounds
	CategoryID *int64
	MerchantID *int64
	Type       string // TypeExpense or TypeRefund
	Confirmed  *bool
}

// Expenses reads and writes the expenses table. Every method is scoped to the
// given user; another user's expenses, categories and merchants behave as if
// they do not exist.
type Expenses struct{ DB *sql.DB }

const maxNoteLen = 500

const expenseCols = `e.id, e.occurred_on, e.amount_cents, e.type, e.category_id, m.id, m.name, e.note,
	e.refunded_expense_id,
	COALESCE((SELECT SUM(r.amount_cents) FROM expenses r
	           WHERE r.user_id = e.user_id AND r.refunded_expense_id = e.id), 0),
	(SELECT MAX(r.occurred_on) FROM expenses r
	  WHERE r.user_id = e.user_id AND r.refunded_expense_id = e.id),
	e.confirmed, e.template_apply_id, e.import_id, e.created_at, e.updated_at`

const expenseFrom = ` FROM expenses e JOIN merchants m ON m.id = e.merchant_id AND m.user_id = e.user_id`

// Create adds one expense or refund.
func (x Expenses) Create(ctx context.Context, userID int64, in NewExpense) (Expense, error) {
	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return Expense{}, err
	}
	defer tx.Rollback()

	id, err := insertExpense(ctx, tx, userID, in)
	if err != nil {
		return Expense{}, err
	}
	exp, err := getExpense(ctx, tx, userID, id)
	if err != nil {
		return Expense{}, err
	}
	return exp, tx.Commit()
}

// CreateBatch adds every item in one transaction, all or nothing. A failing
// item is reported as a *BatchItemError wrapping the item's error. The result
// is in input order.
func (x Expenses) CreateBatch(ctx context.Context, userID int64, items []NewExpense) ([]Expense, error) {
	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	out := make([]Expense, len(items))
	for i, in := range items {
		id, err := insertExpense(ctx, tx, userID, in)
		if err != nil {
			return nil, &BatchItemError{Index: i, Err: err}
		}
		if out[i], err = getExpense(ctx, tx, userID, id); err != nil {
			return nil, err
		}
	}
	return out, tx.Commit()
}

// Get returns one expense.
func (x Expenses) Get(ctx context.Context, userID, id int64) (Expense, error) {
	return getExpense(ctx, x.DB, userID, id)
}

// Update applies a partial update. Any edit confirms the expense unless the
// patch sets Confirmed to false.
func (x Expenses) Update(ctx context.Context, userID, id int64, p ExpensePatch) (Expense, error) {
	if p.Date == nil && p.AmountCents == nil && p.CategoryID == nil && p.MerchantName == nil &&
		!p.SetNote && !p.SetRefundedExpenseID && p.Confirmed == nil {
		return Expense{}, invalid("body", "must set at least one field")
	}
	var (
		merchantName string
		note         *string
		err          error
	)
	if p.Date != nil {
		if err := checkDate(*p.Date, "date"); err != nil {
			return Expense{}, err
		}
	}
	if p.AmountCents != nil && *p.AmountCents == 0 {
		return Expense{}, invalid("amount_cents", "must not be zero")
	}
	if p.MerchantName != nil {
		if merchantName, err = cleanMerchantName(*p.MerchantName, "merchant_name"); err != nil {
			return Expense{}, err
		}
	}
	if p.SetNote {
		if note, err = cleanNote(p.Note); err != nil {
			return Expense{}, err
		}
	}

	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return Expense{}, err
	}
	defer tx.Rollback()

	cur, err := getExpense(ctx, tx, userID, id)
	if err != nil {
		return Expense{}, err
	}
	next := cur
	if p.Date != nil {
		next.Date = *p.Date
	}
	if p.AmountCents != nil {
		next.AmountCents = *p.AmountCents
	}
	if p.CategoryID != nil {
		if err := checkCategory(ctx, tx, userID, *p.CategoryID); err != nil {
			return Expense{}, err
		}
		next.CategoryID = *p.CategoryID
	}
	if p.SetNote {
		next.Note = note
	}
	if p.SetRefundedExpenseID {
		next.RefundedExpenseID = p.RefundedExpenseID
	}
	next.Confirmed = true
	if p.Confirmed != nil {
		next.Confirmed = *p.Confirmed
	}

	if next.AmountCents < 0 && cur.AmountCents > 0 {
		var linked bool
		if err := tx.QueryRowContext(ctx,
			`SELECT EXISTS (SELECT 1 FROM expenses WHERE user_id = ? AND refunded_expense_id = ?)`,
			userID, id).Scan(&linked); err != nil {
			return Expense{}, err
		}
		if linked {
			return Expense{}, ErrHasLinkedRefunds
		}
	}
	if err := checkRefundLink(ctx, tx, userID, id, next.AmountCents, next.RefundedExpenseID); err != nil {
		return Expense{}, err
	}
	if p.MerchantName != nil {
		if next.Merchant, err = resolveMerchant(ctx, tx, userID, merchantName); err != nil {
			return Expense{}, err
		}
	}

	if _, err := tx.ExecContext(ctx, `UPDATE expenses
		SET occurred_on = ?, amount_cents = ?, category_id = ?, merchant_id = ?, note = ?,
		    refunded_expense_id = ?, confirmed = ?, updated_at = `+nowSQL+`
		WHERE id = ? AND user_id = ?`,
		next.Date, next.AmountCents, next.CategoryID, next.Merchant.ID, next.Note,
		next.RefundedExpenseID, next.Confirmed, id, userID); err != nil {
		return Expense{}, mapConstraint(err)
	}
	exp, err := getExpense(ctx, tx, userID, id)
	if err != nil {
		return Expense{}, err
	}
	return exp, tx.Commit()
}

// Delete removes an expense. Refunds that pointed at it are unlinked, never
// deleted.
func (x Expenses) Delete(ctx context.Context, userID, id int64) error {
	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := getExpense(ctx, tx, userID, id); err != nil {
		return err
	}
	// ON DELETE SET NULL would unlink them too; doing it here keeps the rule
	// visible and bumps updated_at.
	if _, err := tx.ExecContext(ctx,
		`UPDATE expenses SET refunded_expense_id = NULL, updated_at = `+nowSQL+`
		 WHERE user_id = ? AND refunded_expense_id = ?`, userID, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM expenses WHERE id = ? AND user_id = ?`, id, userID); err != nil {
		return mapConstraint(err)
	}
	return tx.Commit()
}

// List returns the user's expenses matching f, sorted by date descending and
// then newest first, one page at a time. The second result is the cursor for
// the next page ("" on the last one).
func (x Expenses) List(ctx context.Context, userID int64, f ExpenseFilter, page Page) ([]Expense, string, error) {
	limit, err := page.limit()
	if err != nil {
		return nil, "", err
	}
	where := []string{"e.user_id = ?"}
	args := []any{userID}

	if f.From, f.To, err = dateBounds(f.Month, f.From, f.To); err != nil {
		return nil, "", err
	}
	if f.From != "" {
		where = append(where, "e.occurred_on >= ?")
		args = append(args, f.From)
	}
	if f.To != "" {
		where = append(where, "e.occurred_on <= ?")
		args = append(args, f.To)
	}
	if f.CategoryID != nil {
		where = append(where, "e.category_id = ?")
		args = append(args, *f.CategoryID)
	}
	if f.MerchantID != nil {
		where = append(where, "e.merchant_id = ?")
		args = append(args, *f.MerchantID)
	}
	switch f.Type {
	case "":
	case TypeExpense, TypeRefund:
		where = append(where, "e.type = ?")
		args = append(args, f.Type)
	default:
		return nil, "", invalid("type", "must be expense or refund")
	}
	if f.Confirmed != nil {
		where = append(where, "e.confirmed = ?")
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
		where = append(where, "(e.occurred_on < ? OR (e.occurred_on = ? AND e.id < ?))")
		args = append(args, parts[0], parts[0], lastID)
	}
	args = append(args, limit+1)

	rows, err := x.DB.QueryContext(ctx, `SELECT `+expenseCols+expenseFrom+
		` WHERE `+strings.Join(where, " AND ")+
		` ORDER BY e.occurred_on DESC, e.id DESC LIMIT ?`, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	out := []Expense{}
	for rows.Next() {
		exp, err := scanExpense(rows)
		if err != nil {
			return nil, "", err
		}
		out = append(out, exp)
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

// insertExpense validates in and inserts it, creating its merchant if needed.
func insertExpense(ctx context.Context, tx *sql.Tx, userID int64, in NewExpense) (int64, error) {
	if err := checkDate(in.Date, "date"); err != nil {
		return 0, err
	}
	if in.AmountCents == 0 {
		return 0, invalid("amount_cents", "must not be zero")
	}
	name, err := cleanMerchantName(in.MerchantName, "merchant_name")
	if err != nil {
		return 0, err
	}
	note, err := cleanNote(in.Note)
	if err != nil {
		return 0, err
	}
	if err := checkCategory(ctx, tx, userID, in.CategoryID); err != nil {
		return 0, err
	}
	if err := checkRefundLink(ctx, tx, userID, 0, in.AmountCents, in.RefundedExpenseID); err != nil {
		return 0, err
	}
	mer, err := resolveMerchant(ctx, tx, userID, name)
	if err != nil {
		return 0, err
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO expenses
		(user_id, category_id, merchant_id, occurred_on, amount_cents, note, refunded_expense_id, confirmed)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		userID, in.CategoryID, mer.ID, in.Date, in.AmountCents, note, in.RefundedExpenseID, in.Confirmed)
	if err != nil {
		return 0, mapConstraint(err)
	}
	return res.LastInsertId()
}

// checkRefundLink allows a link only on a negative amount, and only to one of
// the user's positive expenses other than self (0 when creating).
func checkRefundLink(ctx context.Context, q querier, userID, self, amount int64, link *int64) error {
	if link == nil {
		return nil
	}
	if amount >= 0 || *link == self {
		return ErrInvalidRefundLink
	}
	var ok bool
	if err := q.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM expenses WHERE id = ? AND user_id = ? AND amount_cents > 0)`,
		*link, userID).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return ErrInvalidRefundLink
	}
	return nil
}

// checkCategory rejects a category id that is not one of the user's.
func checkCategory(ctx context.Context, q querier, userID, id int64) error {
	var ok bool
	if err := q.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM categories WHERE id = ? AND user_id = ?)`, id, userID).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return invalid("category_id", "must be one of your categories")
	}
	return nil
}

// checkDate requires a real calendar date written as YYYY-MM-DD.
func checkDate(s, field string) error {
	if _, err := time.Parse(time.DateOnly, s); err != nil || len(s) != len(time.DateOnly) {
		return invalid(field, "must be a date as YYYY-MM-DD")
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
		return nil, invalid("note", "must be at most 500 characters")
	}
	return &s, nil
}

func getExpense(ctx context.Context, q querier, userID, id int64) (Expense, error) {
	exp, err := scanExpense(q.QueryRowContext(ctx,
		`SELECT `+expenseCols+expenseFrom+` WHERE e.id = ? AND e.user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return Expense{}, ErrNotFound
	}
	return exp, err
}

func scanExpense(s interface{ Scan(...any) error }) (Expense, error) {
	var (
		exp              Expense
		note, lastRefund sql.NullString
		refunded, apply  sql.NullInt64
		importID         sql.NullInt64
		created, updated string
	)
	if err := s.Scan(&exp.ID, &exp.Date, &exp.AmountCents, &exp.Type, &exp.CategoryID,
		&exp.Merchant.ID, &exp.Merchant.Name, &note, &refunded, &exp.RefundedTotalCents, &lastRefund,
		&exp.Confirmed, &apply, &importID, &created, &updated); err != nil {
		return Expense{}, err
	}
	if note.Valid {
		exp.Note = &note.String
	}
	if refunded.Valid {
		exp.RefundedExpenseID = &refunded.Int64
	}
	if lastRefund.Valid {
		exp.LastRefundDate = &lastRefund.String
	}
	if apply.Valid {
		exp.TemplateApplyID = &apply.Int64
	}
	if importID.Valid {
		exp.ImportID = &importID.Int64
	}
	var err error
	if exp.CreatedAt, err = parseTS(created); err != nil {
		return Expense{}, err
	}
	if exp.UpdatedAt, err = parseTS(updated); err != nil {
		return Expense{}, err
	}
	return exp, nil
}

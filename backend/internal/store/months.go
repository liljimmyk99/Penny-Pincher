package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// ErrMonthNotEmpty: a template was applied to a month that already has
// expenses or income entries, without asking to reset it.
var ErrMonthNotEmpty = errors.New("month not empty")

// TemplateApply is a template_applies row with counts of the entries that
// still point at it.
type TemplateApply struct {
	ID           int64
	TemplateID   *int64  // nil once the template is deleted
	TemplateName *string // nil once the template is deleted
	Month        string  // YYYY-MM
	AppliedAt    time.Time
	// Entries dated anywhere that still carry this apply's id. Undo and
	// deletes lower these; edits and confirms do not.
	ExpenseCount     int
	IncomeEntryCount int
	// Entries from this apply still unconfirmed: what Undo would remove.
	UnconfirmedCount int
}

// ApplyResult is a new apply plus what reset_month deleted first.
type ApplyResult struct {
	TemplateApply
	RemovedExpenseCount     int
	RemovedIncomeEntryCount int
}

// Months holds the month actions: start a month from a template, undo that,
// confirm everything in a month, and save a month as a template. Every
// method is scoped to the given user.
type Months struct{ DB *sql.DB }

// ApplyTemplate copies every item of the user's template into month as an
// unconfirmed entry, dated on the item's day of month clamped to the month's
// last day. If the month already has any expense or income entry it returns
// ErrMonthNotEmpty, unless reset is set: then, in the same transaction, it
// first deletes every expense and income entry dated in the month and the
// month's earlier applies. Refunds in other months that pointed at deleted
// expenses are unlinked by the foreign key, not deleted.
func (x Months) ApplyTemplate(ctx context.Context, userID int64, month string, templateID int64, reset bool) (ApplyResult, error) {
	from, to, lastDay, err := monthBounds(month)
	if err != nil {
		return ApplyResult{}, err
	}
	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return ApplyResult{}, err
	}
	defer tx.Rollback()

	if err := checkTemplate(ctx, tx, userID, templateID); err != nil {
		return ApplyResult{}, err
	}
	var out ApplyResult
	if reset {
		if out.RemovedExpenseCount, err = execCount(ctx, tx,
			`DELETE FROM expenses WHERE user_id = ? AND occurred_on BETWEEN ? AND ?`, userID, from, to); err != nil {
			return ApplyResult{}, err
		}
		if out.RemovedIncomeEntryCount, err = execCount(ctx, tx,
			`DELETE FROM income_entries WHERE user_id = ? AND received_on BETWEEN ? AND ?`, userID, from, to); err != nil {
			return ApplyResult{}, err
		}
		if _, err := tx.ExecContext(ctx,
			`DELETE FROM template_applies WHERE user_id = ? AND year_month = ?`, userID, month); err != nil {
			return ApplyResult{}, err
		}
	} else {
		var hasData bool
		if err := tx.QueryRowContext(ctx, `SELECT
			EXISTS (SELECT 1 FROM expenses WHERE user_id = ? AND occurred_on BETWEEN ? AND ?) OR
			EXISTS (SELECT 1 FROM income_entries WHERE user_id = ? AND received_on BETWEEN ? AND ?)`,
			userID, from, to, userID, from, to).Scan(&hasData); err != nil {
			return ApplyResult{}, err
		}
		if hasData {
			return ApplyResult{}, ErrMonthNotEmpty
		}
	}

	res, err := tx.ExecContext(ctx,
		`INSERT INTO template_applies (user_id, template_id, year_month) VALUES (?, ?, ?)`, userID, templateID, month)
	if err != nil {
		return ApplyResult{}, err
	}
	applyID, err := res.LastInsertId()
	if err != nil {
		return ApplyResult{}, err
	}
	// Day 29–31 in a shorter month lands on its last day (lastDay comes from
	// the real calendar, so February follows leap years).
	if _, err := tx.ExecContext(ctx, `INSERT INTO expenses
		(user_id, category_id, merchant_id, occurred_on, amount_cents, note, confirmed, template_apply_id)
		SELECT user_id, category_id, merchant_id, printf('%s-%02d', ?, min(day_of_month, ?)), amount_cents, note, 0, ?
		FROM template_expense_items WHERE template_id = ? AND user_id = ? ORDER BY sort_order, id`,
		month, lastDay, applyID, templateID, userID); err != nil {
		return ApplyResult{}, mapConstraint(err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO income_entries
		(user_id, income_source_id, received_on, gross_cents, gross_taxable_cents, net_cents, note, confirmed, template_apply_id)
		SELECT user_id, income_source_id, printf('%s-%02d', ?, min(day_of_month, ?)),
		       gross_cents, gross_taxable_cents, net_cents, note, 0, ?
		FROM template_income_items WHERE template_id = ? AND user_id = ? ORDER BY sort_order, id`,
		month, lastDay, applyID, templateID, userID); err != nil {
		return ApplyResult{}, mapConstraint(err)
	}
	if out.TemplateApply, err = getApply(ctx, tx, userID, applyID); err != nil {
		return ApplyResult{}, err
	}
	return out, tx.Commit()
}

// ListApplies returns the user's applies for month, newest first.
func (x Months) ListApplies(ctx context.Context, userID int64, month string) ([]TemplateApply, error) {
	if _, _, _, err := monthBounds(month); err != nil {
		return nil, err
	}
	rows, err := x.DB.QueryContext(ctx, `SELECT `+applyCols+applyFrom+
		` WHERE a.user_id = ? AND a.year_month = ? ORDER BY a.applied_at DESC, a.id DESC`, userID, month)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TemplateApply{}
	for rows.Next() {
		a, err := scanApply(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// Undo deletes the entries the user's apply created that are still
// unconfirmed. Confirmed or edited entries stay, and so does the apply, so a
// second call removes nothing.
func (x Months) Undo(ctx context.Context, userID, applyID int64) (removedExpenses, removedIncome int, err error) {
	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()

	var ok bool
	if err := tx.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM template_applies WHERE id = ? AND user_id = ?)`, applyID, userID).Scan(&ok); err != nil {
		return 0, 0, err
	}
	if !ok {
		return 0, 0, ErrNotFound
	}
	if removedExpenses, err = execCount(ctx, tx,
		`DELETE FROM expenses WHERE user_id = ? AND template_apply_id = ? AND confirmed = 0`, userID, applyID); err != nil {
		return 0, 0, err
	}
	if removedIncome, err = execCount(ctx, tx,
		`DELETE FROM income_entries WHERE user_id = ? AND template_apply_id = ? AND confirmed = 0`, userID, applyID); err != nil {
		return 0, 0, err
	}
	return removedExpenses, removedIncome, tx.Commit()
}

// ConfirmAll confirms every unconfirmed expense and income entry dated in
// month, as they are.
func (x Months) ConfirmAll(ctx context.Context, userID int64, month string) (expenses, income int, err error) {
	from, to, _, err := monthBounds(month)
	if err != nil {
		return 0, 0, err
	}
	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()

	if expenses, err = execCount(ctx, tx, `UPDATE expenses SET confirmed = 1, updated_at = `+nowSQL+`
		WHERE user_id = ? AND confirmed = 0 AND occurred_on BETWEEN ? AND ?`, userID, from, to); err != nil {
		return 0, 0, err
	}
	if income, err = execCount(ctx, tx, `UPDATE income_entries SET confirmed = 1, updated_at = `+nowSQL+`
		WHERE user_id = ? AND confirmed = 0 AND received_on BETWEEN ? AND ?`, userID, from, to); err != nil {
		return 0, 0, err
	}
	return expenses, income, tx.Commit()
}

// SaveAsTemplate creates a template from the expenses and income entries
// dated in month (confirmed or not), each item on the day of its entry's
// date and in date order. Refunds are skipped. The month is unchanged.
func (x Months) SaveAsTemplate(ctx context.Context, userID int64, month, name string) (Template, error) {
	from, to, _, err := monthBounds(month)
	if err != nil {
		return Template{}, err
	}
	if name, err = cleanName(name); err != nil {
		return Template{}, err
	}
	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return Template{}, err
	}
	defer tx.Rollback()

	if err := checkNameFree(ctx, tx, "templates", userID, name, 0); err != nil {
		return Template{}, err
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO templates (user_id, name) VALUES (?, ?)`, userID, name)
	if err != nil {
		return Template{}, mapConstraint(err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Template{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO template_expense_items
		(template_id, user_id, category_id, merchant_id, day_of_month, amount_cents, note, sort_order)
		SELECT ?, user_id, category_id, merchant_id, CAST(substr(occurred_on, 9, 2) AS INTEGER), amount_cents, note,
		       ? * row_number() OVER (ORDER BY occurred_on, id)
		FROM expenses WHERE user_id = ? AND amount_cents > 0 AND occurred_on BETWEEN ? AND ?`,
		id, sortStep, userID, from, to); err != nil {
		return Template{}, mapConstraint(err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO template_income_items
		(template_id, user_id, income_source_id, day_of_month, gross_cents, gross_taxable_cents, net_cents, note, sort_order)
		SELECT ?, user_id, income_source_id, CAST(substr(received_on, 9, 2) AS INTEGER),
		       gross_cents, gross_taxable_cents, net_cents, note,
		       ? * row_number() OVER (ORDER BY received_on, id)
		FROM income_entries WHERE user_id = ? AND received_on BETWEEN ? AND ?`,
		id, sortStep, userID, from, to); err != nil {
		return Template{}, mapConstraint(err)
	}
	t, err := getTemplate(ctx, tx, userID, id)
	if err != nil {
		return Template{}, err
	}
	return t, tx.Commit()
}

// monthBounds checks month is YYYY-MM and returns its first and last dates
// and the number of its last day, from the real calendar.
func monthBounds(month string) (from, to string, lastDay int, err error) {
	t, perr := time.Parse("2006-01", month)
	if perr != nil || len(month) != 7 {
		return "", "", 0, invalid("month", "must be YYYY-MM")
	}
	last := t.AddDate(0, 1, -1) // day 0 of next month
	return t.Format(time.DateOnly), last.Format(time.DateOnly), last.Day(), nil
}

// execCount runs a statement and returns how many rows it changed.
func execCount(ctx context.Context, tx *sql.Tx, q string, args ...any) (int, error) {
	res, err := tx.ExecContext(ctx, q, args...)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	return int(n), err
}

const applyCols = `a.id, a.template_id, t.name, a.year_month, a.applied_at,
	(SELECT count(*) FROM expenses e WHERE e.user_id = a.user_id AND e.template_apply_id = a.id),
	(SELECT count(*) FROM income_entries i WHERE i.user_id = a.user_id AND i.template_apply_id = a.id),
	(SELECT count(*) FROM expenses e WHERE e.user_id = a.user_id AND e.template_apply_id = a.id AND e.confirmed = 0) +
	(SELECT count(*) FROM income_entries i WHERE i.user_id = a.user_id AND i.template_apply_id = a.id AND i.confirmed = 0)`

const applyFrom = ` FROM template_applies a
	LEFT JOIN templates t ON t.id = a.template_id AND t.user_id = a.user_id`

func getApply(ctx context.Context, q querier, userID, id int64) (TemplateApply, error) {
	a, err := scanApply(q.QueryRowContext(ctx, `SELECT `+applyCols+applyFrom+` WHERE a.id = ? AND a.user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return TemplateApply{}, ErrNotFound
	}
	return a, err
}

func scanApply(s interface{ Scan(...any) error }) (TemplateApply, error) {
	var (
		a       TemplateApply
		tmplID  sql.NullInt64
		name    sql.NullString
		applied string
	)
	if err := s.Scan(&a.ID, &tmplID, &name, &a.Month, &applied,
		&a.ExpenseCount, &a.IncomeEntryCount, &a.UnconfirmedCount); err != nil {
		return TemplateApply{}, err
	}
	if tmplID.Valid {
		a.TemplateID = &tmplID.Int64
	}
	if name.Valid {
		a.TemplateName = &name.String
	}
	var err error
	if a.AppliedAt, err = parseTS(applied); err != nil {
		return TemplateApply{}, err
	}
	return a, nil
}

package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// TemplateSummary is a templates row with its item counts.
type TemplateSummary struct {
	ID               int64
	Name             string
	ExpenseItemCount int
	IncomeItemCount  int
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// Template is a templates row with its items, each list in sort order.
type Template struct {
	ID           int64
	Name         string
	ExpenseItems []TemplateExpenseItem
	IncomeItems  []TemplateIncomeItem
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// TemplateExpenseItem is a template_expense_items row with its merchant.
type TemplateExpenseItem struct {
	ID          int64
	CategoryID  int64
	Merchant    Merchant
	DayOfMonth  int
	AmountCents int64
	Note        *string
	SortOrder   int
}

// TemplateIncomeItem is a template_income_items row.
type TemplateIncomeItem struct {
	ID                int64
	SourceID          int64
	DayOfMonth        int
	GrossCents        int64
	GrossTaxableCents int64
	NetCents          int64
	Note              *string
	SortOrder         int
}

// NewTemplateExpenseItem is the input for adding an expense item. A nil
// SortOrder puts the item at the end of the list.
type NewTemplateExpenseItem struct {
	CategoryID   int64
	MerchantName string // matched case-insensitively, or created
	DayOfMonth   int
	AmountCents  int64
	Note         *string
	SortOrder    *int
}

// TemplateExpenseItemPatch is a partial update. Nil fields are left
// unchanged; SetNote with a nil Note clears the note.
type TemplateExpenseItemPatch struct {
	CategoryID   *int64
	MerchantName *string
	DayOfMonth   *int
	AmountCents  *int64
	SetNote      bool
	Note         *string
	SortOrder    *int
}

// NewTemplateIncomeItem is the input for adding an income item. A nil
// SortOrder puts the item at the end of the list.
type NewTemplateIncomeItem struct {
	SourceID          int64
	DayOfMonth        int
	GrossCents        int64
	GrossTaxableCents int64
	NetCents          int64
	Note              *string
	SortOrder         *int
}

// TemplateIncomeItemPatch is a partial update. Nil fields are left
// unchanged; SetNote with a nil Note clears the note.
type TemplateIncomeItemPatch struct {
	SourceID          *int64
	DayOfMonth        *int
	GrossCents        *int64
	GrossTaxableCents *int64
	NetCents          *int64
	SetNote           bool
	Note              *string
	SortOrder         *int
}

// Templates reads and writes templates and their items. Every method is
// scoped to the given user; another user's templates, items, categories and
// income sources behave as if they do not exist. Any change to an item also
// bumps its template's updated_at.
type Templates struct{ DB *sql.DB }

const templateSummaryCols = `t.id, t.name,
	(SELECT count(*) FROM template_expense_items i WHERE i.user_id = t.user_id AND i.template_id = t.id),
	(SELECT count(*) FROM template_income_items i WHERE i.user_id = t.user_id AND i.template_id = t.id),
	t.created_at, t.updated_at`

const templateExpenseItemCols = `i.id, i.category_id, m.id, m.name, i.day_of_month, i.amount_cents, i.note, i.sort_order`

const templateExpenseItemFrom = ` FROM template_expense_items i
	JOIN merchants m ON m.id = i.merchant_id AND m.user_id = i.user_id`

const templateIncomeItemCols = `id, income_source_id, day_of_month, gross_cents, gross_taxable_cents, net_cents,
	note, sort_order`

// List returns the user's templates sorted by name, without their items.
func (x Templates) List(ctx context.Context, userID int64) ([]TemplateSummary, error) {
	rows, err := x.DB.QueryContext(ctx,
		`SELECT `+templateSummaryCols+` FROM templates t WHERE t.user_id = ? ORDER BY t.name, t.id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TemplateSummary{}
	for rows.Next() {
		var (
			s                TemplateSummary
			created, updated string
		)
		if err := rows.Scan(&s.ID, &s.Name, &s.ExpenseItemCount, &s.IncomeItemCount, &created, &updated); err != nil {
			return nil, err
		}
		if s.CreatedAt, err = parseTS(created); err != nil {
			return nil, err
		}
		if s.UpdatedAt, err = parseTS(updated); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// Get returns one template with its items.
func (x Templates) Get(ctx context.Context, userID, id int64) (Template, error) {
	return getTemplate(ctx, x.DB, userID, id)
}

// Create adds an empty template.
func (x Templates) Create(ctx context.Context, userID int64, name string) (Template, error) {
	name, err := cleanName(name)
	if err != nil {
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
	t, err := getTemplate(ctx, tx, userID, id)
	if err != nil {
		return Template{}, err
	}
	return t, tx.Commit()
}

// Rename changes a template's name.
func (x Templates) Rename(ctx context.Context, userID, id int64, name string) (Template, error) {
	name, err := cleanName(name)
	if err != nil {
		return Template{}, err
	}
	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return Template{}, err
	}
	defer tx.Rollback()

	if err := checkTemplate(ctx, tx, userID, id); err != nil {
		return Template{}, err
	}
	if err := checkNameFree(ctx, tx, "templates", userID, name, id); err != nil {
		return Template{}, err
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE templates SET name = ?, updated_at = `+nowSQL+` WHERE id = ? AND user_id = ?`,
		name, id, userID); err != nil {
		return Template{}, mapConstraint(err)
	}
	t, err := getTemplate(ctx, tx, userID, id)
	if err != nil {
		return Template{}, err
	}
	return t, tx.Commit()
}

// Delete removes a template and its items. Entries already copied into
// months are untouched; past applies keep a NULL template_id.
func (x Templates) Delete(ctx context.Context, userID, id int64) error {
	res, err := x.DB.ExecContext(ctx, `DELETE FROM templates WHERE id = ? AND user_id = ?`, id, userID)
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

// CreateExpenseItem adds an expense item to one of the user's templates,
// creating its merchant if needed.
func (x Templates) CreateExpenseItem(ctx context.Context, userID, templateID int64, in NewTemplateExpenseItem) (TemplateExpenseItem, error) {
	if err := checkDayOfMonth(in.DayOfMonth); err != nil {
		return TemplateExpenseItem{}, err
	}
	if err := checkItemAmount(in.AmountCents); err != nil {
		return TemplateExpenseItem{}, err
	}
	name, err := cleanMerchantName(in.MerchantName, "merchant_name")
	if err != nil {
		return TemplateExpenseItem{}, err
	}
	note, err := cleanNote(in.Note)
	if err != nil {
		return TemplateExpenseItem{}, err
	}

	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return TemplateExpenseItem{}, err
	}
	defer tx.Rollback()

	if err := checkTemplate(ctx, tx, userID, templateID); err != nil {
		return TemplateExpenseItem{}, err
	}
	if err := checkCategory(ctx, tx, userID, in.CategoryID); err != nil {
		return TemplateExpenseItem{}, err
	}
	sort, err := itemSortOrder(ctx, tx, "template_expense_items", userID, templateID, in.SortOrder)
	if err != nil {
		return TemplateExpenseItem{}, err
	}
	mer, err := resolveMerchant(ctx, tx, userID, name)
	if err != nil {
		return TemplateExpenseItem{}, err
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO template_expense_items
		(template_id, user_id, category_id, merchant_id, day_of_month, amount_cents, note, sort_order)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		templateID, userID, in.CategoryID, mer.ID, in.DayOfMonth, in.AmountCents, note, sort)
	if err != nil {
		return TemplateExpenseItem{}, mapConstraint(err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return TemplateExpenseItem{}, err
	}
	return finishItem(ctx, tx, userID, templateID, id, getTemplateExpenseItem)
}

// UpdateExpenseItem applies a partial update to one of a template's expense
// items.
func (x Templates) UpdateExpenseItem(ctx context.Context, userID, templateID, id int64, p TemplateExpenseItemPatch) (TemplateExpenseItem, error) {
	if p.CategoryID == nil && p.MerchantName == nil && p.DayOfMonth == nil && p.AmountCents == nil &&
		!p.SetNote && p.SortOrder == nil {
		return TemplateExpenseItem{}, invalid("body", "must set at least one field")
	}
	var (
		merchantName string
		note         *string
		err          error
	)
	if p.DayOfMonth != nil {
		if err := checkDayOfMonth(*p.DayOfMonth); err != nil {
			return TemplateExpenseItem{}, err
		}
	}
	if p.AmountCents != nil {
		if err := checkItemAmount(*p.AmountCents); err != nil {
			return TemplateExpenseItem{}, err
		}
	}
	if p.MerchantName != nil {
		if merchantName, err = cleanMerchantName(*p.MerchantName, "merchant_name"); err != nil {
			return TemplateExpenseItem{}, err
		}
	}
	if p.SetNote {
		if note, err = cleanNote(p.Note); err != nil {
			return TemplateExpenseItem{}, err
		}
	}

	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return TemplateExpenseItem{}, err
	}
	defer tx.Rollback()

	it, err := getTemplateExpenseItem(ctx, tx, userID, templateID, id)
	if err != nil {
		return TemplateExpenseItem{}, err
	}
	if p.CategoryID != nil {
		if err := checkCategory(ctx, tx, userID, *p.CategoryID); err != nil {
			return TemplateExpenseItem{}, err
		}
		it.CategoryID = *p.CategoryID
	}
	if p.MerchantName != nil {
		if it.Merchant, err = resolveMerchant(ctx, tx, userID, merchantName); err != nil {
			return TemplateExpenseItem{}, err
		}
	}
	if p.DayOfMonth != nil {
		it.DayOfMonth = *p.DayOfMonth
	}
	if p.AmountCents != nil {
		it.AmountCents = *p.AmountCents
	}
	if p.SetNote {
		it.Note = note
	}
	if p.SortOrder != nil {
		it.SortOrder = *p.SortOrder
	}
	if _, err := tx.ExecContext(ctx, `UPDATE template_expense_items
		SET category_id = ?, merchant_id = ?, day_of_month = ?, amount_cents = ?, note = ?, sort_order = ?
		WHERE id = ? AND template_id = ? AND user_id = ?`,
		it.CategoryID, it.Merchant.ID, it.DayOfMonth, it.AmountCents, it.Note, it.SortOrder,
		id, templateID, userID); err != nil {
		return TemplateExpenseItem{}, mapConstraint(err)
	}
	return finishItem(ctx, tx, userID, templateID, id, getTemplateExpenseItem)
}

// DeleteExpenseItem removes one of a template's expense items.
func (x Templates) DeleteExpenseItem(ctx context.Context, userID, templateID, id int64) error {
	return x.deleteItem(ctx, "template_expense_items", userID, templateID, id)
}

// CreateIncomeItem adds an income item to one of the user's templates.
func (x Templates) CreateIncomeItem(ctx context.Context, userID, templateID int64, in NewTemplateIncomeItem) (TemplateIncomeItem, error) {
	if err := checkDayOfMonth(in.DayOfMonth); err != nil {
		return TemplateIncomeItem{}, err
	}
	if err := checkIncomeFigures(in.GrossCents, in.GrossTaxableCents, in.NetCents); err != nil {
		return TemplateIncomeItem{}, err
	}
	note, err := cleanNote(in.Note)
	if err != nil {
		return TemplateIncomeItem{}, err
	}

	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return TemplateIncomeItem{}, err
	}
	defer tx.Rollback()

	if err := checkTemplate(ctx, tx, userID, templateID); err != nil {
		return TemplateIncomeItem{}, err
	}
	if err := checkSourceOwned(ctx, tx, userID, in.SourceID); err != nil {
		return TemplateIncomeItem{}, err
	}
	sort, err := itemSortOrder(ctx, tx, "template_income_items", userID, templateID, in.SortOrder)
	if err != nil {
		return TemplateIncomeItem{}, err
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO template_income_items
		(template_id, user_id, income_source_id, day_of_month, gross_cents, gross_taxable_cents, net_cents, note, sort_order)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		templateID, userID, in.SourceID, in.DayOfMonth, in.GrossCents, in.GrossTaxableCents, in.NetCents, note, sort)
	if err != nil {
		return TemplateIncomeItem{}, mapConstraint(err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return TemplateIncomeItem{}, err
	}
	return finishItem(ctx, tx, userID, templateID, id, getTemplateIncomeItem)
}

// UpdateIncomeItem applies a partial update to one of a template's income
// items. The result must still have taxable <= gross and net <= gross.
func (x Templates) UpdateIncomeItem(ctx context.Context, userID, templateID, id int64, p TemplateIncomeItemPatch) (TemplateIncomeItem, error) {
	if p.SourceID == nil && p.DayOfMonth == nil && p.GrossCents == nil && p.GrossTaxableCents == nil &&
		p.NetCents == nil && !p.SetNote && p.SortOrder == nil {
		return TemplateIncomeItem{}, invalid("body", "must set at least one field")
	}
	if p.DayOfMonth != nil {
		if err := checkDayOfMonth(*p.DayOfMonth); err != nil {
			return TemplateIncomeItem{}, err
		}
	}
	var (
		note *string
		err  error
	)
	if p.SetNote {
		if note, err = cleanNote(p.Note); err != nil {
			return TemplateIncomeItem{}, err
		}
	}

	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return TemplateIncomeItem{}, err
	}
	defer tx.Rollback()

	it, err := getTemplateIncomeItem(ctx, tx, userID, templateID, id)
	if err != nil {
		return TemplateIncomeItem{}, err
	}
	if p.SourceID != nil {
		if err := checkSourceOwned(ctx, tx, userID, *p.SourceID); err != nil {
			return TemplateIncomeItem{}, err
		}
		it.SourceID = *p.SourceID
	}
	if p.DayOfMonth != nil {
		it.DayOfMonth = *p.DayOfMonth
	}
	if p.GrossCents != nil {
		it.GrossCents = *p.GrossCents
	}
	if p.GrossTaxableCents != nil {
		it.GrossTaxableCents = *p.GrossTaxableCents
	}
	if p.NetCents != nil {
		it.NetCents = *p.NetCents
	}
	if p.SetNote {
		it.Note = note
	}
	if p.SortOrder != nil {
		it.SortOrder = *p.SortOrder
	}
	if err := checkIncomeFigures(it.GrossCents, it.GrossTaxableCents, it.NetCents); err != nil {
		return TemplateIncomeItem{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE template_income_items
		SET income_source_id = ?, day_of_month = ?, gross_cents = ?, gross_taxable_cents = ?, net_cents = ?,
		    note = ?, sort_order = ?
		WHERE id = ? AND template_id = ? AND user_id = ?`,
		it.SourceID, it.DayOfMonth, it.GrossCents, it.GrossTaxableCents, it.NetCents, it.Note, it.SortOrder,
		id, templateID, userID); err != nil {
		return TemplateIncomeItem{}, mapConstraint(err)
	}
	return finishItem(ctx, tx, userID, templateID, id, getTemplateIncomeItem)
}

// DeleteIncomeItem removes one of a template's income items.
func (x Templates) DeleteIncomeItem(ctx context.Context, userID, templateID, id int64) error {
	return x.deleteItem(ctx, "template_income_items", userID, templateID, id)
}

// deleteItem removes an item from table (one of the two constant item table
// names, never user input) and bumps its template's updated_at.
func (x Templates) deleteItem(ctx context.Context, table string, userID, templateID, id int64) error {
	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx,
		`DELETE FROM `+table+` WHERE id = ? AND template_id = ? AND user_id = ?`, id, templateID, userID)
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
	if err := touchTemplate(ctx, tx, userID, templateID); err != nil {
		return err
	}
	return tx.Commit()
}

// finishItem bumps the template's updated_at, reads the item back with get
// and commits.
func finishItem[T any](ctx context.Context, tx *sql.Tx, userID, templateID, id int64,
	get func(context.Context, querier, int64, int64, int64) (T, error)) (T, error) {
	var zero T
	if err := touchTemplate(ctx, tx, userID, templateID); err != nil {
		return zero, err
	}
	it, err := get(ctx, tx, userID, templateID, id)
	if err != nil {
		return zero, err
	}
	return it, tx.Commit()
}

func touchTemplate(ctx context.Context, tx *sql.Tx, userID, id int64) error {
	_, err := tx.ExecContext(ctx,
		`UPDATE templates SET updated_at = `+nowSQL+` WHERE id = ? AND user_id = ?`, id, userID)
	return err
}

// checkTemplate returns ErrNotFound unless id is one of the user's templates.
func checkTemplate(ctx context.Context, q querier, userID, id int64) error {
	var ok bool
	if err := q.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM templates WHERE id = ? AND user_id = ?)`, id, userID).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return ErrNotFound
	}
	return nil
}

// itemSortOrder returns want, or the end of the template's list in table when
// want is nil.
func itemSortOrder(ctx context.Context, tx *sql.Tx, table string, userID, templateID int64, want *int) (int, error) {
	if want != nil {
		return *want, nil
	}
	var maxSort int
	if err := tx.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(sort_order), 0) FROM `+table+` WHERE template_id = ? AND user_id = ?`,
		templateID, userID).Scan(&maxSort); err != nil {
		return 0, err
	}
	return maxSort + sortStep, nil
}

func checkDayOfMonth(d int) error {
	if d < 1 || d > 31 {
		return invalid("day_of_month", "must be between 1 and 31")
	}
	return nil
}

func checkItemAmount(c int64) error {
	if c < 1 {
		return invalid("amount_cents", "must be at least 1")
	}
	return nil
}

func getTemplate(ctx context.Context, q querier, userID, id int64) (Template, error) {
	var (
		t                TemplateSummary
		created, updated string
	)
	err := q.QueryRowContext(ctx, `SELECT `+templateSummaryCols+` FROM templates t WHERE t.id = ? AND t.user_id = ?`,
		id, userID).Scan(&t.ID, &t.Name, &t.ExpenseItemCount, &t.IncomeItemCount, &created, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		return Template{}, ErrNotFound
	}
	if err != nil {
		return Template{}, err
	}
	out := Template{ID: t.ID, Name: t.Name}
	if out.CreatedAt, err = parseTS(created); err != nil {
		return Template{}, err
	}
	if out.UpdatedAt, err = parseTS(updated); err != nil {
		return Template{}, err
	}
	if out.ExpenseItems, err = listTemplateExpenseItems(ctx, q, userID, id); err != nil {
		return Template{}, err
	}
	if out.IncomeItems, err = listTemplateIncomeItems(ctx, q, userID, id); err != nil {
		return Template{}, err
	}
	return out, nil
}

func listTemplateExpenseItems(ctx context.Context, q querier, userID, templateID int64) ([]TemplateExpenseItem, error) {
	rows, err := q.QueryContext(ctx, `SELECT `+templateExpenseItemCols+templateExpenseItemFrom+
		` WHERE i.template_id = ? AND i.user_id = ? ORDER BY i.sort_order, i.id`, templateID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TemplateExpenseItem{}
	for rows.Next() {
		it, err := scanTemplateExpenseItem(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func listTemplateIncomeItems(ctx context.Context, q querier, userID, templateID int64) ([]TemplateIncomeItem, error) {
	rows, err := q.QueryContext(ctx, `SELECT `+templateIncomeItemCols+` FROM template_income_items
		WHERE template_id = ? AND user_id = ? ORDER BY sort_order, id`, templateID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TemplateIncomeItem{}
	for rows.Next() {
		it, err := scanTemplateIncomeItem(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func getTemplateExpenseItem(ctx context.Context, q querier, userID, templateID, id int64) (TemplateExpenseItem, error) {
	it, err := scanTemplateExpenseItem(q.QueryRowContext(ctx, `SELECT `+templateExpenseItemCols+templateExpenseItemFrom+
		` WHERE i.id = ? AND i.template_id = ? AND i.user_id = ?`, id, templateID, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return TemplateExpenseItem{}, ErrNotFound
	}
	return it, err
}

func getTemplateIncomeItem(ctx context.Context, q querier, userID, templateID, id int64) (TemplateIncomeItem, error) {
	it, err := scanTemplateIncomeItem(q.QueryRowContext(ctx, `SELECT `+templateIncomeItemCols+
		` FROM template_income_items WHERE id = ? AND template_id = ? AND user_id = ?`, id, templateID, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return TemplateIncomeItem{}, ErrNotFound
	}
	return it, err
}

func scanTemplateExpenseItem(s interface{ Scan(...any) error }) (TemplateExpenseItem, error) {
	var (
		it   TemplateExpenseItem
		note sql.NullString
	)
	if err := s.Scan(&it.ID, &it.CategoryID, &it.Merchant.ID, &it.Merchant.Name, &it.DayOfMonth,
		&it.AmountCents, &note, &it.SortOrder); err != nil {
		return TemplateExpenseItem{}, err
	}
	if note.Valid {
		it.Note = &note.String
	}
	return it, nil
}

func scanTemplateIncomeItem(s interface{ Scan(...any) error }) (TemplateIncomeItem, error) {
	var (
		it   TemplateIncomeItem
		note sql.NullString
	)
	if err := s.Scan(&it.ID, &it.SourceID, &it.DayOfMonth, &it.GrossCents, &it.GrossTaxableCents,
		&it.NetCents, &note, &it.SortOrder); err != nil {
		return TemplateIncomeItem{}, err
	}
	if note.Valid {
		it.Note = &note.String
	}
	return it, nil
}

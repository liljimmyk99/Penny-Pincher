package store

import (
	"context"
	"database/sql"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// Category is an expense category row.
type Category struct {
	ID          int64
	Name        string
	Color       *string // "#RRGGBB", or nil for none
	IsSaving    bool
	IsProtected bool // true only for "Other"
	SortOrder   int
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// NewCategory is the input for CreateCategory.
type NewCategory struct {
	Name     string
	Color    *string
	IsSaving bool
}

// CategoryPatch is a partial update. Nil fields are left unchanged; Color is
// applied only when SetColor is true (a nil Color then clears it).
type CategoryPatch struct {
	Name     *string
	SetColor bool
	Color    *string
	IsSaving *bool
}

// Categories reads and writes the categories table. Every method is scoped to
// the given user; another user's categories behave as if they do not exist.
type Categories struct{ DB *sql.DB }

const categoryCols = `id, name, color, is_saving, is_protected, sort_order, created_at, updated_at`

// sortStep spaces sort_order values so the seeded order and reorders agree.
const sortStep = 10

var colorRE = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

type querier interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// List returns every category for the user, in sort order.
func (c Categories) List(ctx context.Context, userID int64) ([]Category, error) {
	return listCategories(ctx, c.DB, userID)
}

// Create adds a category at the end of the list, or just before "Other" when
// "Other" is last.
func (c Categories) Create(ctx context.Context, userID int64, in NewCategory) (Category, error) {
	name, err := cleanName(in.Name)
	if err != nil {
		return Category{}, err
	}
	if err := checkColor(in.Color); err != nil {
		return Category{}, err
	}

	tx, err := c.DB.BeginTx(ctx, nil)
	if err != nil {
		return Category{}, err
	}
	defer tx.Rollback()

	if err := checkNameFree(ctx, tx, userID, name, 0); err != nil {
		return Category{}, err
	}

	var maxSort int
	if err := tx.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(sort_order), 0) FROM categories WHERE user_id = ? AND is_protected = 0`,
		userID).Scan(&maxSort); err != nil {
		return Category{}, err
	}
	sort := maxSort + sortStep
	var otherID int64
	var otherSort int
	err = tx.QueryRowContext(ctx,
		`SELECT id, sort_order FROM categories WHERE user_id = ? AND is_protected = 1`, userID).
		Scan(&otherID, &otherSort)
	switch {
	case errors.Is(err, sql.ErrNoRows):
	case err != nil:
		return Category{}, err
	case otherSort > maxSort && sort >= otherSort:
		// "Other" is last: keep it last.
		if _, err := tx.ExecContext(ctx,
			`UPDATE categories SET sort_order = ?, updated_at = `+nowSQL+` WHERE id = ? AND user_id = ?`,
			sort+sortStep, otherID, userID); err != nil {
			return Category{}, err
		}
	}

	res, err := tx.ExecContext(ctx,
		`INSERT INTO categories (user_id, name, color, is_saving, sort_order) VALUES (?, ?, ?, ?, ?)`,
		userID, name, in.Color, in.IsSaving, sort)
	if err != nil {
		return Category{}, mapConstraint(err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Category{}, err
	}
	cat, err := getCategory(ctx, tx, userID, id)
	if err != nil {
		return Category{}, err
	}
	return cat, tx.Commit()
}

// Update applies a partial update. On the protected "Other" category only the
// colour may change; anything else returns ErrProtected.
func (c Categories) Update(ctx context.Context, userID, id int64, p CategoryPatch) (Category, error) {
	if p.Name == nil && !p.SetColor && p.IsSaving == nil {
		return Category{}, invalid("body", "must set at least one of name, color, is_saving")
	}
	var name string
	if p.Name != nil {
		var err error
		if name, err = cleanName(*p.Name); err != nil {
			return Category{}, err
		}
	}
	if p.SetColor {
		if err := checkColor(p.Color); err != nil {
			return Category{}, err
		}
	}

	tx, err := c.DB.BeginTx(ctx, nil)
	if err != nil {
		return Category{}, err
	}
	defer tx.Rollback()

	cur, err := getCategory(ctx, tx, userID, id)
	if err != nil {
		return Category{}, err
	}
	if cur.IsProtected && (p.Name != nil || p.IsSaving != nil) {
		return Category{}, ErrProtected
	}

	sets := []string{"updated_at = " + nowSQL}
	var args []any
	if p.Name != nil {
		if err := checkNameFree(ctx, tx, userID, name, id); err != nil {
			return Category{}, err
		}
		sets = append(sets, "name = ?")
		args = append(args, name)
	}
	if p.SetColor {
		sets = append(sets, "color = ?")
		args = append(args, p.Color)
	}
	if p.IsSaving != nil {
		sets = append(sets, "is_saving = ?")
		args = append(args, *p.IsSaving)
	}
	args = append(args, id, userID)
	if _, err := tx.ExecContext(ctx,
		`UPDATE categories SET `+strings.Join(sets, ", ")+` WHERE id = ? AND user_id = ?`, args...); err != nil {
		return Category{}, mapConstraint(err)
	}
	cat, err := getCategory(ctx, tx, userID, id)
	if err != nil {
		return Category{}, err
	}
	return cat, tx.Commit()
}

// Reorder sets sort_order for the whole list. ids must name every one of the
// user's categories exactly once ("Other" included).
func (c Categories) Reorder(ctx context.Context, userID int64, ids []int64) ([]Category, error) {
	tx, err := c.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	current, err := listCategories(ctx, tx, userID)
	if err != nil {
		return nil, err
	}
	pending := make(map[int64]bool, len(current))
	for _, cat := range current {
		pending[cat.ID] = true
	}
	if len(ids) != len(current) {
		return nil, invalid("ids", "must list every category exactly once")
	}
	for _, id := range ids {
		if !pending[id] {
			return nil, invalid("ids", "must list every category exactly once")
		}
		delete(pending, id)
	}

	for i, id := range ids {
		if _, err := tx.ExecContext(ctx,
			`UPDATE categories SET sort_order = ?, updated_at = `+nowSQL+` WHERE id = ? AND user_id = ?`,
			(i+1)*sortStep, id, userID); err != nil {
			return nil, err
		}
	}
	out, err := listCategories(ctx, tx, userID)
	if err != nil {
		return nil, err
	}
	return out, tx.Commit()
}

// Delete removes a category in one transaction: its expenses and template
// items move to "Other", saved trends matching it are removed, then the row
// is deleted. Deleting "Other" returns ErrProtected.
func (c Categories) Delete(ctx context.Context, userID, id int64) error {
	tx, err := c.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	cur, err := getCategory(ctx, tx, userID, id)
	if err != nil {
		return err
	}
	if cur.IsProtected {
		return ErrProtected
	}
	var otherID int64
	if err := tx.QueryRowContext(ctx,
		`SELECT id FROM categories WHERE user_id = ? AND is_protected = 1`, userID).Scan(&otherID); err != nil {
		return err
	}

	// The categories_reassign_to_other trigger would do the moves too; doing
	// them here keeps the rule visible and the trigger a safety net.
	for _, q := range []string{
		`UPDATE expenses SET category_id = ?, updated_at = ` + nowSQL + ` WHERE user_id = ? AND category_id = ?`,
		`UPDATE template_expense_items SET category_id = ? WHERE user_id = ? AND category_id = ?`,
	} {
		if _, err := tx.ExecContext(ctx, q, otherID, userID, id); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM saved_trends WHERE user_id = ? AND match_type = 'category' AND category_id = ?`,
		userID, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM categories WHERE id = ? AND user_id = ?`, id, userID); err != nil {
		return mapConstraint(err)
	}
	return tx.Commit()
}

const nowSQL = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`

func listCategories(ctx context.Context, q querier, userID int64) ([]Category, error) {
	rows, err := q.QueryContext(ctx,
		`SELECT `+categoryCols+` FROM categories WHERE user_id = ? ORDER BY sort_order, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Category{}
	for rows.Next() {
		cat, err := scanCategory(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, cat)
	}
	return out, rows.Err()
}

func getCategory(ctx context.Context, q querier, userID, id int64) (Category, error) {
	cat, err := scanCategory(q.QueryRowContext(ctx,
		`SELECT `+categoryCols+` FROM categories WHERE id = ? AND user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return Category{}, ErrNotFound
	}
	return cat, err
}

func scanCategory(s interface{ Scan(...any) error }) (Category, error) {
	var (
		cat              Category
		color            sql.NullString
		created, updated string
	)
	if err := s.Scan(&cat.ID, &cat.Name, &color, &cat.IsSaving, &cat.IsProtected, &cat.SortOrder, &created, &updated); err != nil {
		return Category{}, err
	}
	if color.Valid {
		cat.Color = &color.String
	}
	var err error
	if cat.CreatedAt, err = parseTS(created); err != nil {
		return Category{}, err
	}
	if cat.UpdatedAt, err = parseTS(updated); err != nil {
		return Category{}, err
	}
	return cat, nil
}

func checkNameFree(ctx context.Context, q querier, userID int64, name string, exceptID int64) error {
	var taken bool
	if err := q.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM categories WHERE user_id = ? AND name = ? COLLATE NOCASE AND id <> ?)`,
		userID, name, exceptID).Scan(&taken); err != nil {
		return err
	}
	if taken {
		return ErrNameTaken
	}
	return nil
}

// cleanName trims a name and checks the spec's 1–100 character limit.
func cleanName(s string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", invalid("name", "must not be empty")
	}
	if utf8.RuneCountInString(s) > 100 {
		return "", invalid("name", "must be at most 100 characters")
	}
	return s, nil
}

func checkColor(c *string) error {
	if c != nil && !colorRE.MatchString(*c) {
		return invalid("color", "must look like #RRGGBB")
	}
	return nil
}

func parseTS(s string) (time.Time, error) { return time.Parse(time.RFC3339Nano, s) }

package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
)

// catFixture is a database with two seeded users, A and B.
type catFixture struct {
	t    *testing.T
	db   *sql.DB
	c    Categories
	a, b int64
}

func newCatFixture(t *testing.T) *catFixture {
	t.Helper()
	db := NewTestDB(t)
	f := &catFixture{t: t, db: db, c: Categories{DB: db}}
	var err error
	if f.a, err = AddUser(context.Background(), db, NewUser{FirebaseUID: "uid-a", Role: RoleMember}); err != nil {
		t.Fatal(err)
	}
	if f.b, err = AddUser(context.Background(), db, NewUser{FirebaseUID: "uid-b", Role: RoleMember}); err != nil {
		t.Fatal(err)
	}
	return f
}

// byName returns the user's category with this name.
func (f *catFixture) byName(user int64, name string) Category {
	f.t.Helper()
	cats, err := f.c.List(context.Background(), user)
	if err != nil {
		f.t.Fatal(err)
	}
	for _, c := range cats {
		if c.Name == name {
			return c
		}
	}
	f.t.Fatalf("user %d has no category %q", user, name)
	return Category{}
}

func (f *catFixture) names(user int64) string {
	f.t.Helper()
	cats, err := f.c.List(context.Background(), user)
	if err != nil {
		f.t.Fatal(err)
	}
	var n []string
	for _, c := range cats {
		n = append(n, c.Name)
	}
	return strings.Join(n, ",")
}

func (f *catFixture) exec(q string, args ...any) int64 {
	f.t.Helper()
	res, err := f.db.Exec(q, args...)
	if err != nil {
		f.t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func (f *catFixture) count(q string, args ...any) int {
	f.t.Helper()
	var n int
	if err := f.db.QueryRow(q, args...).Scan(&n); err != nil {
		f.t.Fatal(err)
	}
	return n
}

func ptr[T any](v T) *T { return &v }

func wantValidation(t *testing.T, err error, field string) {
	t.Helper()
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Field != field {
		t.Fatalf("err = %v, want validation error on %q", err, field)
	}
}

const seededNames = "Saving,Housing,Utilities,Food,Transportation,Entertainment,Debt,Other"

func TestListCategoriesSortedAndScopedToUser(t *testing.T) {
	f := newCatFixture(t)
	ctx := context.Background()
	if _, err := f.c.Create(ctx, f.b, NewCategory{Name: "Pets"}); err != nil {
		t.Fatal(err)
	}
	if got := f.names(f.a); got != seededNames {
		t.Fatalf("user A = %s", got)
	}
	cats, _ := f.c.List(ctx, f.a)
	saving, other := cats[0], cats[len(cats)-1]
	if !saving.IsSaving || saving.IsProtected || !other.IsProtected || other.IsSaving {
		t.Fatalf("flags: saving=%+v other=%+v", saving, other)
	}
	if saving.CreatedAt.IsZero() || saving.UpdatedAt.IsZero() {
		t.Fatalf("timestamps not parsed: %+v", saving)
	}
	if got := f.names(f.b); got != "Saving,Housing,Utilities,Food,Transportation,Entertainment,Debt,Pets,Other" {
		t.Fatalf("user B = %s", got)
	}
	none, err := f.c.List(ctx, 9999)
	if err != nil || len(none) != 0 {
		t.Fatalf("unknown user = %v, %v", none, err)
	}
}

func TestCreateCategory(t *testing.T) {
	f := newCatFixture(t)
	ctx := context.Background()

	cat, err := f.c.Create(ctx, f.a, NewCategory{Name: "  Pets  ", Color: ptr("#2f80ED"), IsSaving: true})
	if err != nil {
		t.Fatal(err)
	}
	if cat.Name != "Pets" || cat.Color == nil || *cat.Color != "#2f80ED" || !cat.IsSaving || cat.IsProtected {
		t.Fatalf("created = %+v", cat)
	}
	// Lands before "Other", which stays last; again for a second one.
	if _, err := f.c.Create(ctx, f.a, NewCategory{Name: "Gifts"}); err != nil {
		t.Fatal(err)
	}
	if got := f.names(f.a); got != "Saving,Housing,Utilities,Food,Transportation,Entertainment,Debt,Pets,Gifts,Other" {
		t.Fatalf("order = %s", got)
	}
	if c := f.byName(f.a, "Gifts"); c.Color != nil || c.IsSaving {
		t.Fatalf("defaults = %+v", c)
	}

	// Names are unique per user, case-insensitively, but not across users.
	if _, err := f.c.Create(ctx, f.a, NewCategory{Name: "FOOD"}); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("duplicate = %v", err)
	}
	if _, err := f.c.Create(ctx, f.a, NewCategory{Name: "other"}); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("duplicate of Other = %v", err)
	}
	if _, err := f.c.Create(ctx, f.b, NewCategory{Name: "Pets"}); err != nil {
		t.Fatalf("same name for another user = %v", err)
	}

	_, err = f.c.Create(ctx, f.a, NewCategory{Name: "   "})
	wantValidation(t, err, "name")
	_, err = f.c.Create(ctx, f.a, NewCategory{Name: strings.Repeat("é", 101)})
	wantValidation(t, err, "name")
	if _, err := f.c.Create(ctx, f.a, NewCategory{Name: strings.Repeat("é", 100)}); err != nil {
		t.Fatalf("100 characters = %v", err)
	}
	for _, bad := range []string{"red", "#12345", "#1234567", "#GGGGGG", ""} {
		_, err = f.c.Create(ctx, f.a, NewCategory{Name: "Bad " + bad, Color: ptr(bad)})
		wantValidation(t, err, "color")
	}
}

func TestCreateCategoryWhenOtherIsNotLast(t *testing.T) {
	f := newCatFixture(t)
	ctx := context.Background()
	other := f.byName(f.a, "Other")
	ids := []int64{other.ID}
	cats, _ := f.c.List(ctx, f.a)
	for _, c := range cats[:len(cats)-1] {
		ids = append(ids, c.ID)
	}
	if _, err := f.c.Reorder(ctx, f.a, ids); err != nil {
		t.Fatal(err)
	}
	if _, err := f.c.Create(ctx, f.a, NewCategory{Name: "Pets"}); err != nil {
		t.Fatal(err)
	}
	if got := f.names(f.a); got != "Other,Saving,Housing,Utilities,Food,Transportation,Entertainment,Debt,Pets" {
		t.Fatalf("order = %s", got)
	}
}

func TestUpdateCategory(t *testing.T) {
	f := newCatFixture(t)
	ctx := context.Background()
	food := f.byName(f.a, "Food")

	cat, err := f.c.Update(ctx, f.a, food.ID, CategoryPatch{Name: ptr(" Groceries "), SetColor: true, Color: ptr("#00AA00")})
	if err != nil {
		t.Fatal(err)
	}
	if cat.Name != "Groceries" || *cat.Color != "#00AA00" || cat.IsSaving || cat.SortOrder != food.SortOrder {
		t.Fatalf("updated = %+v", cat)
	}
	if cat.UpdatedAt.Before(food.UpdatedAt) || !cat.CreatedAt.Equal(food.CreatedAt) {
		t.Fatalf("updated_at went backwards")
	}

	// Omitted fields stay; SetColor with nil clears the colour.
	cat, err = f.c.Update(ctx, f.a, food.ID, CategoryPatch{IsSaving: ptr(true)})
	if err != nil || cat.Name != "Groceries" || cat.Color == nil || !cat.IsSaving {
		t.Fatalf("flag only = %+v, %v", cat, err)
	}
	cat, err = f.c.Update(ctx, f.a, food.ID, CategoryPatch{SetColor: true})
	if err != nil || cat.Color != nil || !cat.IsSaving {
		t.Fatalf("clear colour = %+v, %v", cat, err)
	}

	// Changing only the case of its own name is allowed; taking another's is not.
	if cat, err = f.c.Update(ctx, f.a, food.ID, CategoryPatch{Name: ptr("GROCERIES")}); err != nil || cat.Name != "GROCERIES" {
		t.Fatalf("case change = %+v, %v", cat, err)
	}
	if _, err := f.c.Update(ctx, f.a, food.ID, CategoryPatch{Name: ptr("housing")}); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("taken = %v", err)
	}

	_, err = f.c.Update(ctx, f.a, food.ID, CategoryPatch{})
	wantValidation(t, err, "body")
	_, err = f.c.Update(ctx, f.a, food.ID, CategoryPatch{Name: ptr("")})
	wantValidation(t, err, "name")
	_, err = f.c.Update(ctx, f.a, food.ID, CategoryPatch{SetColor: true, Color: ptr("blue")})
	wantValidation(t, err, "color")

	if _, err := f.c.Update(ctx, f.a, 9999, CategoryPatch{Name: ptr("X")}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing = %v", err)
	}
}

func TestOtherCategoryIsProtected(t *testing.T) {
	f := newCatFixture(t)
	ctx := context.Background()
	other := f.byName(f.a, "Other")

	for name, p := range map[string]CategoryPatch{
		"rename":         {Name: ptr("Misc")},
		"same name":      {Name: ptr("Other")},
		"is_saving":      {IsSaving: ptr(true)},
		"is_saving off":  {IsSaving: ptr(false)},
		"rename+recolor": {Name: ptr("Misc"), SetColor: true, Color: ptr("#123456")},
	} {
		if _, err := f.c.Update(ctx, f.a, other.ID, p); !errors.Is(err, ErrProtected) {
			t.Errorf("%s: err = %v, want ErrProtected", name, err)
		}
	}
	if c := f.byName(f.a, "Other"); c.Color != nil {
		t.Fatalf("rejected patch still recolored: %+v", c)
	}

	// Recolor and clear are allowed.
	cat, err := f.c.Update(ctx, f.a, other.ID, CategoryPatch{SetColor: true, Color: ptr("#999999")})
	if err != nil || *cat.Color != "#999999" || !cat.IsProtected || cat.Name != "Other" {
		t.Fatalf("recolor = %+v, %v", cat, err)
	}
	if cat, err = f.c.Update(ctx, f.a, other.ID, CategoryPatch{SetColor: true}); err != nil || cat.Color != nil {
		t.Fatalf("clear = %+v, %v", cat, err)
	}

	if err := f.c.Delete(ctx, f.a, other.ID); !errors.Is(err, ErrProtected) {
		t.Fatalf("delete = %v", err)
	}
	if f.byName(f.a, "Other").ID != other.ID {
		t.Fatal("Other was deleted")
	}
}

func TestCategoryTriggersAreTheSafetyNet(t *testing.T) {
	f := newCatFixture(t)
	other := f.byName(f.a, "Other")
	for _, q := range []string{
		`UPDATE categories SET name = 'Misc' WHERE id = ?`,
		`UPDATE categories SET is_saving = 1 WHERE id = ?`,
		`DELETE FROM categories WHERE id = ?`,
	} {
		_, err := f.db.Exec(q, other.ID)
		if !errors.Is(mapConstraint(err), ErrProtected) {
			t.Errorf("%s: err = %v, want a trigger abort", q, err)
		}
	}
	food := f.byName(f.a, "Food")
	if _, err := f.db.Exec(`UPDATE categories SET is_protected = 1 WHERE id = ?`, food.ID); !errors.Is(mapConstraint(err), ErrProtected) {
		t.Errorf("promote: err = %v", err)
	}
	_, err := f.db.Exec(`UPDATE categories SET name = 'Housing' WHERE id = ?`, food.ID)
	if !errors.Is(mapConstraint(err), ErrNameTaken) {
		t.Errorf("unique: err = %v", err)
	}
}

func TestReorderCategories(t *testing.T) {
	f := newCatFixture(t)
	ctx := context.Background()
	cats, _ := f.c.List(ctx, f.a)
	// Reverse: Other first, Saving last.
	var ids []int64
	for i := len(cats) - 1; i >= 0; i-- {
		ids = append(ids, cats[i].ID)
	}
	out, err := f.c.Reorder(ctx, f.a, ids)
	if err != nil {
		t.Fatal(err)
	}
	want := "Other,Debt,Entertainment,Transportation,Food,Utilities,Housing,Saving"
	if got := f.names(f.a); got != want {
		t.Fatalf("order = %s", got)
	}
	for i, c := range out {
		if c.ID != ids[i] || c.SortOrder != (i+1)*10 {
			t.Fatalf("returned[%d] = %+v", i, c)
		}
	}

	bOther := f.byName(f.b, "Other")
	for name, bad := range map[string][]int64{
		"missing one":  ids[1:],
		"repeated":     append(append([]int64{}, ids[:len(ids)-1]...), ids[0]),
		"extra":        append(append([]int64{}, ids...), 9999),
		"unknown":      append(append([]int64{}, ids[:len(ids)-1]...), 9999),
		"other user's": append(append([]int64{}, ids[:len(ids)-1]...), bOther.ID),
		"empty":        nil,
	} {
		_, err := f.c.Reorder(ctx, f.a, bad)
		wantValidation(t, err, "ids")
		if got := f.names(f.a); got != want {
			t.Fatalf("%s changed the order: %s", name, got)
		}
	}
	if got := f.names(f.b); got != seededNames {
		t.Fatalf("user B order changed: %s", got)
	}
}

func TestDeleteCategoryReassignsToOther(t *testing.T) {
	f := newCatFixture(t)
	ctx := context.Background()
	food, other := f.byName(f.a, "Food"), f.byName(f.a, "Other")
	housing := f.byName(f.a, "Housing")

	merchant := f.exec(`INSERT INTO merchants (user_id, name) VALUES (?, 'Shop')`, f.a)
	tmpl := f.count(`SELECT id FROM templates WHERE user_id = ?`, f.a)
	e1 := f.exec(`INSERT INTO expenses (user_id, category_id, merchant_id, occurred_on, amount_cents) VALUES (?, ?, ?, '2026-01-05', 1000)`, f.a, food.ID, merchant)
	refund := f.exec(`INSERT INTO expenses (user_id, category_id, merchant_id, occurred_on, amount_cents, refunded_expense_id) VALUES (?, ?, ?, '2026-02-01', -300, ?)`, f.a, food.ID, merchant, e1)
	keep := f.exec(`INSERT INTO expenses (user_id, category_id, merchant_id, occurred_on, amount_cents) VALUES (?, ?, ?, '2026-01-06', 2000)`, f.a, housing.ID, merchant)
	item := f.exec(`INSERT INTO template_expense_items (template_id, user_id, category_id, merchant_id, day_of_month, amount_cents) VALUES (?, ?, ?, ?, 3, 500)`, tmpl, f.a, food.ID, merchant)
	f.exec(`INSERT INTO saved_trends (user_id, name, match_type, category_id, measure) VALUES (?, 'Food trend', 'category', ?, 'amount')`, f.a, food.ID)
	f.exec(`INSERT INTO saved_trends (user_id, name, match_type, category_id, measure) VALUES (?, 'Housing trend', 'category', ?, 'count')`, f.a, housing.ID)
	f.exec(`INSERT INTO saved_trends (user_id, name, match_type, merchant_id, measure) VALUES (?, 'Shop trend', 'merchant', ?, 'amount')`, f.a, merchant)

	if err := f.c.Delete(ctx, f.a, food.ID); err != nil {
		t.Fatal(err)
	}
	if got := f.names(f.a); got != "Saving,Housing,Utilities,Transportation,Entertainment,Debt,Other" {
		t.Fatalf("after delete = %s", got)
	}
	for _, id := range []int64{e1, refund} {
		if n := f.count(`SELECT count(*) FROM expenses WHERE id = ? AND category_id = ?`, id, other.ID); n != 1 {
			t.Errorf("expense %d not moved to Other", id)
		}
	}
	if n := f.count(`SELECT count(*) FROM expenses WHERE id = ? AND refunded_expense_id = ?`, refund, e1); n != 1 {
		t.Error("refund link lost")
	}
	if n := f.count(`SELECT count(*) FROM expenses WHERE id = ? AND category_id = ?`, keep, housing.ID); n != 1 {
		t.Error("unrelated expense moved")
	}
	if n := f.count(`SELECT count(*) FROM template_expense_items WHERE id = ? AND category_id = ?`, item, other.ID); n != 1 {
		t.Error("template item not moved to Other")
	}
	if n := f.count(`SELECT count(*) FROM expenses WHERE user_id = ?`, f.a); n != 3 {
		t.Errorf("expenses = %d, want 3 (none deleted)", n)
	}
	var trends []string
	rows, _ := f.db.Query(`SELECT name FROM saved_trends WHERE user_id = ? ORDER BY name`, f.a)
	for rows.Next() {
		var n string
		rows.Scan(&n)
		trends = append(trends, n)
	}
	rows.Close()
	if strings.Join(trends, ",") != "Housing trend,Shop trend" {
		t.Fatalf("saved trends = %v", trends)
	}

	if err := f.c.Delete(ctx, f.a, food.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second delete = %v", err)
	}
}

func TestCategoryTenancyIsolation(t *testing.T) {
	f := newCatFixture(t)
	ctx := context.Background()
	bFood, bOther := f.byName(f.b, "Food"), f.byName(f.b, "Other")
	merchant := f.exec(`INSERT INTO merchants (user_id, name) VALUES (?, 'Shop')`, f.b)
	exp := f.exec(`INSERT INTO expenses (user_id, category_id, merchant_id, occurred_on, amount_cents) VALUES (?, ?, ?, '2026-01-05', 1000)`, f.b, bFood.ID, merchant)

	// User A cannot see, edit or delete B's rows, protected or not.
	for _, id := range []int64{bFood.ID, bOther.ID} {
		if _, err := f.c.Update(ctx, f.a, id, CategoryPatch{SetColor: true, Color: ptr("#000000")}); !errors.Is(err, ErrNotFound) {
			t.Errorf("update %d = %v", id, err)
		}
		if err := f.c.Delete(ctx, f.a, id); !errors.Is(err, ErrNotFound) {
			t.Errorf("delete %d = %v", id, err)
		}
	}
	if c := f.byName(f.b, "Food"); c.Color != nil {
		t.Fatalf("B's category changed: %+v", c)
	}
	if n := f.count(`SELECT count(*) FROM expenses WHERE id = ? AND category_id = ?`, exp, bFood.ID); n != 1 {
		t.Fatal("B's expense moved")
	}

	// Deleting A's category leaves B's same-named category and data alone.
	if err := f.c.Delete(ctx, f.a, f.byName(f.a, "Food").ID); err != nil {
		t.Fatal(err)
	}
	if got := f.names(f.b); got != seededNames {
		t.Fatalf("B's categories = %s", got)
	}
	// A taken name in B does not block A.
	if _, err := f.c.Create(ctx, f.a, NewCategory{Name: "Food"}); err != nil {
		t.Fatalf("recreate in A = %v", err)
	}
}

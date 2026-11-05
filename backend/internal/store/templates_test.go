package store

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

// tmplFixture is a database with two seeded users, A and B.
type tmplFixture struct {
	*srcFixture
	tp Templates
}

func newTmplFixture(t *testing.T) *tmplFixture {
	t.Helper()
	sf := newSrcFixture(t)
	return &tmplFixture{srcFixture: sf, tp: Templates{DB: sf.db}}
}

func (f *tmplFixture) newTemplate(user int64, name string) Template {
	f.t.Helper()
	t, err := f.tp.Create(context.Background(), user, name)
	if err != nil {
		f.t.Fatal(err)
	}
	return t
}

func (f *tmplFixture) expenseItem(user, tmpl int64, day int) TemplateExpenseItem {
	f.t.Helper()
	it, err := f.tp.CreateExpenseItem(context.Background(), user, tmpl, NewTemplateExpenseItem{
		CategoryID: f.byName(user, "Housing").ID, MerchantName: "Landlord", DayOfMonth: day, AmountCents: 100000,
	})
	if err != nil {
		f.t.Fatal(err)
	}
	return it
}

func (f *tmplFixture) incomeItem(user, tmpl int64, day int) TemplateIncomeItem {
	f.t.Helper()
	it, err := f.tp.CreateIncomeItem(context.Background(), user, tmpl, NewTemplateIncomeItem{
		SourceID: f.src(user, "Other").ID, DayOfMonth: day, GrossCents: 10000, GrossTaxableCents: 9000, NetCents: 7000,
	})
	if err != nil {
		f.t.Fatal(err)
	}
	return it
}

func TestTemplateCRUD(t *testing.T) {
	f := newTmplFixture(t)
	ctx := context.Background()

	// New users start with the seeded empty template.
	list, err := f.tp.List(ctx, f.a)
	if err != nil || len(list) != 1 || list[0].Name != DefaultTemplateName ||
		list[0].ExpenseItemCount != 0 || list[0].IncomeItemCount != 0 {
		t.Fatalf("seeded list = %+v, %v", list, err)
	}

	tm, err := f.tp.Create(ctx, f.a, "  Lean month  ")
	if err != nil {
		t.Fatal(err)
	}
	if tm.Name != "Lean month" || len(tm.ExpenseItems) != 0 || len(tm.IncomeItems) != 0 ||
		tm.CreatedAt.IsZero() || tm.UpdatedAt.IsZero() {
		t.Fatalf("created = %+v", tm)
	}
	if _, err := f.tp.Create(ctx, f.a, "LEAN MONTH"); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("duplicate name err = %v", err)
	}
	if _, err := f.tp.Create(ctx, f.a, "   "); err == nil {
		t.Fatal("blank name accepted")
	} else {
		wantField(t, err, "name")
	}

	got, err := f.tp.Get(ctx, f.a, tm.ID)
	if err != nil || !reflect.DeepEqual(got, tm) {
		t.Fatalf("get = %+v, %v; want %+v", got, err, tm)
	}

	// Sorted by name.
	f.newTemplate(f.a, "Busy month")
	list, _ = f.tp.List(ctx, f.a)
	var names []string
	for _, s := range list {
		names = append(names, s.Name)
	}
	if !reflect.DeepEqual(names, []string{"Busy month", DefaultTemplateName, "Lean month"}) {
		t.Fatalf("names = %v", names)
	}

	renamed, err := f.tp.Rename(ctx, f.a, tm.ID, "Quiet month")
	if err != nil || renamed.Name != "Quiet month" {
		t.Fatalf("rename = %+v, %v", renamed, err)
	}
	// Renaming to its own name (any case) is fine; to another template's is not.
	if _, err := f.tp.Rename(ctx, f.a, tm.ID, "quiet MONTH"); err != nil {
		t.Fatalf("rename to own name: %v", err)
	}
	if _, err := f.tp.Rename(ctx, f.a, tm.ID, "busy month"); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("rename to taken name err = %v", err)
	}
	if _, err := f.tp.Rename(ctx, f.a, 999999, "X"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("rename missing err = %v", err)
	}

	f.expenseItem(f.a, tm.ID, 1)
	f.incomeItem(f.a, tm.ID, 15)
	if err := f.tp.Delete(ctx, f.a, tm.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.tp.Get(ctx, f.a, tm.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get deleted err = %v", err)
	}
	if n := f.count(`SELECT count(*) FROM template_expense_items WHERE template_id = ?`, tm.ID) +
		f.count(`SELECT count(*) FROM template_income_items WHERE template_id = ?`, tm.ID); n != 0 {
		t.Fatalf("%d items left after delete", n)
	}
	if err := f.tp.Delete(ctx, f.a, tm.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete twice err = %v", err)
	}
}

func TestDeleteTemplateKeepsAppliesAndEntries(t *testing.T) {
	f := newTmplFixture(t)
	ctx := context.Background()
	tm := f.newTemplate(f.a, "Month")
	apply := f.exec(`INSERT INTO template_applies (user_id, template_id, year_month) VALUES (?, ?, '2026-03')`, f.a, tm.ID)
	f.exec(`INSERT INTO income_entries (user_id, income_source_id, received_on, gross_cents, gross_taxable_cents,
		net_cents, confirmed, template_apply_id) VALUES (?, ?, '2026-03-15', 100, 90, 70, 0, ?)`,
		f.a, f.src(f.a, "Other").ID, apply)

	if err := f.tp.Delete(ctx, f.a, tm.ID); err != nil {
		t.Fatal(err)
	}
	if n := f.count(`SELECT count(*) FROM template_applies WHERE id = ? AND template_id IS NULL`, apply); n != 1 {
		t.Fatal("apply row not kept with a null template_id")
	}
	if n := f.count(`SELECT count(*) FROM income_entries WHERE template_apply_id = ?`, apply); n != 1 {
		t.Fatal("copied entry was removed")
	}
}

func TestTemplateExpenseItemCRUD(t *testing.T) {
	f := newTmplFixture(t)
	ctx := context.Background()
	tm := f.newTemplate(f.a, "Month")
	housing, food := f.byName(f.a, "Housing"), f.byName(f.a, "Food")

	it, err := f.tp.CreateExpenseItem(ctx, f.a, tm.ID, NewTemplateExpenseItem{
		CategoryID: housing.ID, MerchantName: "  Landlord ", DayOfMonth: 1, AmountCents: 120000, Note: ptr(" rent "),
	})
	if err != nil {
		t.Fatal(err)
	}
	if it.CategoryID != housing.ID || it.Merchant.Name != "Landlord" || it.DayOfMonth != 1 ||
		it.AmountCents != 120000 || it.Note == nil || *it.Note != "rent" || it.SortOrder != sortStep {
		t.Fatalf("created = %+v", it)
	}
	// The next item goes to the end; the merchant is matched case-insensitively.
	it2, err := f.tp.CreateExpenseItem(ctx, f.a, tm.ID, NewTemplateExpenseItem{
		CategoryID: food.ID, MerchantName: "LANDLORD", DayOfMonth: 31, AmountCents: 5000,
	})
	if err != nil {
		t.Fatal(err)
	}
	if it2.SortOrder != 2*sortStep || it2.Merchant.ID != it.Merchant.ID || it2.Note != nil {
		t.Fatalf("second = %+v", it2)
	}
	// An explicit sort_order is kept.
	first, err := f.tp.CreateExpenseItem(ctx, f.a, tm.ID, NewTemplateExpenseItem{
		CategoryID: food.ID, MerchantName: "Grocer", DayOfMonth: 5, AmountCents: 1, SortOrder: ptr(0),
	})
	if err != nil || first.SortOrder != 0 {
		t.Fatalf("explicit sort = %+v, %v", first, err)
	}

	got, err := f.tp.Get(ctx, f.a, tm.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.ExpenseItems, []TemplateExpenseItem{first, it, it2}) {
		t.Fatalf("items = %+v", got.ExpenseItems)
	}
	if list, _ := f.tp.List(ctx, f.a); list[1].Name != "Month" || list[1].ExpenseItemCount != 3 {
		t.Fatalf("summary = %+v", list)
	}

	up, err := f.tp.UpdateExpenseItem(ctx, f.a, tm.ID, it.ID, TemplateExpenseItemPatch{
		CategoryID: &food.ID, MerchantName: ptr("New landlord"), DayOfMonth: ptr(28), AmountCents: ptr(int64(130000)),
		SetNote: true, Note: nil, SortOrder: ptr(99),
	})
	if err != nil {
		t.Fatal(err)
	}
	if up.CategoryID != food.ID || up.Merchant.Name != "New landlord" || up.DayOfMonth != 28 ||
		up.AmountCents != 130000 || up.Note != nil || up.SortOrder != 99 {
		t.Fatalf("updated = %+v", up)
	}
	// Omitted fields are left alone.
	up2, err := f.tp.UpdateExpenseItem(ctx, f.a, tm.ID, it.ID, TemplateExpenseItemPatch{DayOfMonth: ptr(2)})
	if err != nil || up2.DayOfMonth != 2 || up2.AmountCents != 130000 || up2.Merchant != up.Merchant {
		t.Fatalf("partial = %+v, %v", up2, err)
	}
	if _, err := f.tp.UpdateExpenseItem(ctx, f.a, tm.ID, it.ID, TemplateExpenseItemPatch{}); err == nil {
		t.Fatal("empty patch accepted")
	}
	if _, err := f.tp.UpdateExpenseItem(ctx, f.a, tm.ID, it.ID, TemplateExpenseItemPatch{AmountCents: ptr(int64(0))}); err == nil {
		t.Fatal("zero amount accepted")
	} else {
		wantField(t, err, "amount_cents")
	}
	if _, err := f.tp.CreateExpenseItem(ctx, f.a, tm.ID, NewTemplateExpenseItem{
		CategoryID: food.ID, MerchantName: "X", DayOfMonth: 1, AmountCents: -5,
	}); err == nil {
		t.Fatal("negative amount accepted")
	}

	if err := f.tp.DeleteExpenseItem(ctx, f.a, tm.ID, it.ID); err != nil {
		t.Fatal(err)
	}
	if err := f.tp.DeleteExpenseItem(ctx, f.a, tm.ID, it.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete twice err = %v", err)
	}
	// An item is addressed through its own template only.
	other := f.newTemplate(f.a, "Other month")
	if _, err := f.tp.UpdateExpenseItem(ctx, f.a, other.ID, it2.ID, TemplateExpenseItemPatch{DayOfMonth: ptr(3)}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("update via wrong template err = %v", err)
	}
	if err := f.tp.DeleteExpenseItem(ctx, f.a, other.ID, it2.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete via wrong template err = %v", err)
	}
	if _, err := f.tp.CreateExpenseItem(ctx, f.a, 999999, NewTemplateExpenseItem{
		CategoryID: food.ID, MerchantName: "X", DayOfMonth: 1, AmountCents: 1,
	}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing template err = %v", err)
	}
}

func TestTemplateIncomeItemCRUD(t *testing.T) {
	f := newTmplFixture(t)
	ctx := context.Background()
	tm := f.newTemplate(f.a, "Month")
	job := f.create(f.a, "Job")

	it, err := f.tp.CreateIncomeItem(ctx, f.a, tm.ID, NewTemplateIncomeItem{
		SourceID: job.ID, DayOfMonth: 15, GrossCents: 300000, GrossTaxableCents: 280000, NetCents: 210000, Note: ptr("pay"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if it.SourceID != job.ID || it.DayOfMonth != 15 || it.GrossCents != 300000 || it.GrossTaxableCents != 280000 ||
		it.NetCents != 210000 || it.Note == nil || *it.Note != "pay" || it.SortOrder != sortStep {
		t.Fatalf("created = %+v", it)
	}
	it2 := f.incomeItem(f.a, tm.ID, 30)
	if it2.SortOrder != 2*sortStep {
		t.Fatalf("second sort = %d", it2.SortOrder)
	}
	got, _ := f.tp.Get(ctx, f.a, tm.ID)
	if !reflect.DeepEqual(got.IncomeItems, []TemplateIncomeItem{it, it2}) {
		t.Fatalf("items = %+v", got.IncomeItems)
	}

	other := f.src(f.a, "Other")
	up, err := f.tp.UpdateIncomeItem(ctx, f.a, tm.ID, it.ID, TemplateIncomeItemPatch{
		SourceID: &other.ID, DayOfMonth: ptr(31), NetCents: ptr(int64(200000)), SetNote: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if up.SourceID != other.ID || up.DayOfMonth != 31 || up.NetCents != 200000 || up.GrossCents != 300000 || up.Note != nil {
		t.Fatalf("updated = %+v", up)
	}
	// The merged figures must stay consistent.
	if _, err := f.tp.UpdateIncomeItem(ctx, f.a, tm.ID, it.ID, TemplateIncomeItemPatch{GrossCents: ptr(int64(1000))}); err == nil {
		t.Fatal("gross below net accepted")
	} else {
		wantField(t, err, "gross_taxable_cents")
	}
	if _, err := f.tp.CreateIncomeItem(ctx, f.a, tm.ID, NewTemplateIncomeItem{
		SourceID: job.ID, DayOfMonth: 1, GrossCents: 100, GrossTaxableCents: 100, NetCents: 101,
	}); err == nil {
		t.Fatal("net above gross accepted")
	} else {
		wantField(t, err, "net_cents")
	}
	if _, err := f.tp.UpdateIncomeItem(ctx, f.a, tm.ID, it.ID, TemplateIncomeItemPatch{}); err == nil {
		t.Fatal("empty patch accepted")
	}

	if err := f.tp.DeleteIncomeItem(ctx, f.a, tm.ID, it.ID); err != nil {
		t.Fatal(err)
	}
	if err := f.tp.DeleteIncomeItem(ctx, f.a, tm.ID, it.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete twice err = %v", err)
	}
}

func TestTemplateItemDayOfMonth(t *testing.T) {
	f := newTmplFixture(t)
	ctx := context.Background()
	tm := f.newTemplate(f.a, "Month")
	cat, src := f.byName(f.a, "Food").ID, f.src(f.a, "Other").ID

	for _, day := range []int{1, 29, 30, 31} {
		if it := f.expenseItem(f.a, tm.ID, day); it.DayOfMonth != day {
			t.Fatalf("expense day = %d, want %d", it.DayOfMonth, day)
		}
		if it := f.incomeItem(f.a, tm.ID, day); it.DayOfMonth != day {
			t.Fatalf("income day = %d, want %d", it.DayOfMonth, day)
		}
	}
	exp := f.expenseItem(f.a, tm.ID, 10)
	inc := f.incomeItem(f.a, tm.ID, 10)
	for _, day := range []int{0, -1, 32, 100} {
		_, err := f.tp.CreateExpenseItem(ctx, f.a, tm.ID, NewTemplateExpenseItem{
			CategoryID: cat, MerchantName: "X", DayOfMonth: day, AmountCents: 1,
		})
		wantField(t, err, "day_of_month")
		_, err = f.tp.CreateIncomeItem(ctx, f.a, tm.ID, NewTemplateIncomeItem{SourceID: src, DayOfMonth: day})
		wantField(t, err, "day_of_month")
		_, err = f.tp.UpdateExpenseItem(ctx, f.a, tm.ID, exp.ID, TemplateExpenseItemPatch{DayOfMonth: ptr(day)})
		wantField(t, err, "day_of_month")
		_, err = f.tp.UpdateIncomeItem(ctx, f.a, tm.ID, inc.ID, TemplateIncomeItemPatch{DayOfMonth: ptr(day)})
		wantField(t, err, "day_of_month")
	}
}

func TestTemplateTenancy(t *testing.T) {
	f := newTmplFixture(t)
	ctx := context.Background()
	tm := f.newTemplate(f.a, "Mine")
	exp := f.expenseItem(f.a, tm.ID, 1)
	inc := f.incomeItem(f.a, tm.ID, 1)

	// B can use the same name: names are unique per user.
	bt := f.newTemplate(f.b, "Mine")

	// B cannot see, rename, delete or add to A's template.
	if list, _ := f.tp.List(ctx, f.b); len(list) != 2 || list[0].ID == tm.ID || list[1].ID == tm.ID {
		t.Fatalf("B's list = %+v", list)
	}
	if _, err := f.tp.Get(ctx, f.b, tm.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get err = %v", err)
	}
	if _, err := f.tp.Rename(ctx, f.b, tm.ID, "Taken"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("rename err = %v", err)
	}
	if err := f.tp.Delete(ctx, f.b, tm.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete err = %v", err)
	}
	if _, err := f.tp.CreateExpenseItem(ctx, f.b, tm.ID, NewTemplateExpenseItem{
		CategoryID: f.byName(f.b, "Food").ID, MerchantName: "X", DayOfMonth: 1, AmountCents: 1,
	}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("add expense item err = %v", err)
	}
	if _, err := f.tp.CreateIncomeItem(ctx, f.b, tm.ID, NewTemplateIncomeItem{
		SourceID: f.src(f.b, "Other").ID, DayOfMonth: 1,
	}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("add income item err = %v", err)
	}

	// B cannot edit or delete A's items, even through B's own template.
	for _, tid := range []int64{tm.ID, bt.ID} {
		if _, err := f.tp.UpdateExpenseItem(ctx, f.b, tid, exp.ID, TemplateExpenseItemPatch{DayOfMonth: ptr(2)}); !errors.Is(err, ErrNotFound) {
			t.Fatalf("update expense item err = %v", err)
		}
		if _, err := f.tp.UpdateIncomeItem(ctx, f.b, tid, inc.ID, TemplateIncomeItemPatch{DayOfMonth: ptr(2)}); !errors.Is(err, ErrNotFound) {
			t.Fatalf("update income item err = %v", err)
		}
		if err := f.tp.DeleteExpenseItem(ctx, f.b, tid, exp.ID); !errors.Is(err, ErrNotFound) {
			t.Fatalf("delete expense item err = %v", err)
		}
		if err := f.tp.DeleteIncomeItem(ctx, f.b, tid, inc.ID); !errors.Is(err, ErrNotFound) {
			t.Fatalf("delete income item err = %v", err)
		}
	}

	// B's items cannot use A's category or income source.
	_, err := f.tp.CreateExpenseItem(ctx, f.b, bt.ID, NewTemplateExpenseItem{
		CategoryID: f.byName(f.a, "Food").ID, MerchantName: "X", DayOfMonth: 1, AmountCents: 1,
	})
	wantField(t, err, "category_id")
	_, err = f.tp.CreateIncomeItem(ctx, f.b, bt.ID, NewTemplateIncomeItem{SourceID: f.src(f.a, "Other").ID, DayOfMonth: 1})
	wantField(t, err, "income_source_id")
	bexp := f.expenseItem(f.b, bt.ID, 1)
	_, err = f.tp.UpdateExpenseItem(ctx, f.b, bt.ID, bexp.ID, TemplateExpenseItemPatch{CategoryID: ptr(f.byName(f.a, "Food").ID)})
	wantField(t, err, "category_id")
	binc := f.incomeItem(f.b, bt.ID, 1)
	_, err = f.tp.UpdateIncomeItem(ctx, f.b, bt.ID, binc.ID, TemplateIncomeItemPatch{SourceID: ptr(f.src(f.a, "Other").ID)})
	wantField(t, err, "income_source_id")

	// A merchant name B uses becomes B's own merchant, not A's.
	if bexp.Merchant.ID == exp.Merchant.ID {
		t.Fatal("B's item reused A's merchant")
	}

	// A's template is untouched.
	got, err := f.tp.Get(ctx, f.a, tm.ID)
	if err != nil || got.Name != "Mine" || len(got.ExpenseItems) != 1 || len(got.IncomeItems) != 1 ||
		got.ExpenseItems[0] != exp || got.IncomeItems[0] != inc {
		t.Fatalf("A's template = %+v, %v", got, err)
	}
}

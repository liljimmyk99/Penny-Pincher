package store

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

// monthFixture is a database with two seeded users, A and B, and every store
// the month actions touch.
type monthFixture struct {
	*tmplFixture
	mo  Months
	x   Expenses
	inc IncomeEntries
}

func newMonthFixture(t *testing.T) *monthFixture {
	t.Helper()
	tf := newTmplFixture(t)
	return &monthFixture{tmplFixture: tf, mo: Months{DB: tf.db}, x: Expenses{DB: tf.db}, inc: IncomeEntries{DB: tf.db}}
}

func (f *monthFixture) expense(user int64, date string, cents int64, refunds *int64) Expense {
	f.t.Helper()
	exp, err := f.x.Create(context.Background(), user, NewExpense{
		Date: date, AmountCents: cents, CategoryID: f.byName(user, "Food").ID, MerchantName: "Shop",
		RefundedExpenseID: refunds, Confirmed: true,
	})
	if err != nil {
		f.t.Fatal(err)
	}
	return exp
}

func (f *monthFixture) income(user int64, date string) IncomeEntry {
	f.t.Helper()
	e, err := f.inc.Create(context.Background(), user, NewIncomeEntry{
		SourceID: f.src(user, "Other").ID, Date: date, GrossCents: 10000, GrossTaxableCents: 9000, NetCents: 7000, Confirmed: true,
	})
	if err != nil {
		f.t.Fatal(err)
	}
	return e
}

func (f *monthFixture) apply(user int64, month string, tmpl int64, reset bool) ApplyResult {
	f.t.Helper()
	r, err := f.mo.ApplyTemplate(context.Background(), user, month, tmpl, reset)
	if err != nil {
		f.t.Fatal(err)
	}
	return r
}

func (f *monthFixture) expenses(user int64, month string) []Expense {
	f.t.Helper()
	xs, _, err := f.x.List(context.Background(), user, ExpenseFilter{Month: month}, Page{Limit: 200})
	if err != nil {
		f.t.Fatal(err)
	}
	return xs
}

func (f *monthFixture) incomes(user int64, month string) []IncomeEntry {
	f.t.Helper()
	es, _, err := f.inc.List(context.Background(), user, IncomeEntryFilter{Month: month}, Page{Limit: 200})
	if err != nil {
		f.t.Fatal(err)
	}
	return es
}

func expenseDates(xs []Expense) map[string]int {
	out := map[string]int{}
	for _, x := range xs {
		out[x.Date]++
	}
	return out
}

func TestApplyTemplateClampsDays(t *testing.T) {
	f := newMonthFixture(t)
	tm := f.newTemplate(f.a, "Month")
	for _, d := range []int{1, 28, 29, 30, 31} {
		f.expenseItem(f.a, tm.ID, d)
	}
	f.incomeItem(f.a, tm.ID, 31)

	cases := []struct {
		month string
		want  []string // dates for days 1, 28, 29, 30, 31
	}{
		{"2026-01", []string{"2026-01-01", "2026-01-28", "2026-01-29", "2026-01-30", "2026-01-31"}},
		{"2026-04", []string{"2026-04-01", "2026-04-28", "2026-04-29", "2026-04-30", "2026-04-30"}},
		{"2025-02", []string{"2025-02-01", "2025-02-28", "2025-02-28", "2025-02-28", "2025-02-28"}},
		{"2024-02", []string{"2024-02-01", "2024-02-28", "2024-02-29", "2024-02-29", "2024-02-29"}},
		{"2000-02", []string{"2000-02-01", "2000-02-28", "2000-02-29", "2000-02-29", "2000-02-29"}}, // divisible by 400
		{"2100-02", []string{"2100-02-01", "2100-02-28", "2100-02-28", "2100-02-28", "2100-02-28"}}, // divisible by 100
		{"2026-12", []string{"2026-12-01", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31"}},
	}
	for _, c := range cases {
		r := f.apply(f.a, c.month, tm.ID, false)
		if r.Month != c.month || r.TemplateID == nil || *r.TemplateID != tm.ID || *r.TemplateName != "Month" ||
			r.ExpenseCount != 5 || r.IncomeEntryCount != 1 || r.UnconfirmedCount != 6 ||
			r.RemovedExpenseCount != 0 || r.RemovedIncomeEntryCount != 0 || r.AppliedAt.IsZero() {
			t.Fatalf("%s: result = %+v", c.month, r)
		}
		want := map[string]int{}
		for _, d := range c.want {
			want[d]++
		}
		xs := f.expenses(f.a, c.month)
		if got := expenseDates(xs); !reflect.DeepEqual(got, want) {
			t.Fatalf("%s: dates = %v, want %v", c.month, got, want)
		}
		for _, x := range xs {
			if x.Confirmed || x.TemplateApplyID == nil || *x.TemplateApplyID != r.ID || x.AmountCents != 100000 ||
				x.Merchant.Name != "Landlord" || x.CategoryID != f.byName(f.a, "Housing").ID {
				t.Fatalf("%s: copy = %+v", c.month, x)
			}
		}
		es := f.incomes(f.a, c.month)
		if len(es) != 1 || es[0].Date != c.want[4] || es[0].Confirmed || *es[0].TemplateApplyID != r.ID ||
			es[0].GrossCents != 10000 || es[0].GrossTaxableCents != 9000 || es[0].NetCents != 7000 {
			t.Fatalf("%s: income = %+v", c.month, es)
		}
	}

	// The template itself is unchanged.
	got, err := f.tp.Get(context.Background(), f.a, tm.ID)
	if err != nil || len(got.ExpenseItems) != 5 || got.ExpenseItems[4].DayOfMonth != 31 {
		t.Fatalf("template = %+v, %v", got, err)
	}
}

func TestApplyTemplateValidation(t *testing.T) {
	f := newMonthFixture(t)
	ctx := context.Background()
	tm := f.newTemplate(f.a, "Month")
	var ve *ValidationError
	for _, m := range []string{"2026-13", "2026-1", "2026-01-01", "", "abcd-ef"} {
		if _, err := f.mo.ApplyTemplate(ctx, f.a, m, tm.ID, false); !errors.As(err, &ve) || ve.Field != "month" {
			t.Fatalf("%q: err = %v", m, err)
		}
	}
	// Another user's template, or none, is not found.
	if _, err := f.mo.ApplyTemplate(ctx, f.b, "2026-03", tm.ID, false); !errors.Is(err, ErrNotFound) {
		t.Fatalf("other user's template: %v", err)
	}
	if _, err := f.mo.ApplyTemplate(ctx, f.a, "2026-03", 999999, false); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing template: %v", err)
	}
	// An empty template still records an apply.
	r := f.apply(f.a, "2026-03", tm.ID, false)
	if r.ExpenseCount != 0 || r.IncomeEntryCount != 0 || r.UnconfirmedCount != 0 {
		t.Fatalf("empty apply = %+v", r)
	}
}

func TestUndoTemplateApply(t *testing.T) {
	f := newMonthFixture(t)
	ctx := context.Background()
	tm := f.newTemplate(f.a, "Month")
	f.expenseItem(f.a, tm.ID, 1)
	f.expenseItem(f.a, tm.ID, 2)
	f.expenseItem(f.a, tm.ID, 3)
	f.incomeItem(f.a, tm.ID, 1)
	f.incomeItem(f.a, tm.ID, 15)

	r := f.apply(f.a, "2026-05", tm.ID, false)
	xs, es := f.expenses(f.a, "2026-05"), f.incomes(f.a, "2026-05")
	// Editing confirms; confirming as-is confirms too.
	if _, err := f.x.Update(ctx, f.a, xs[0].ID, ExpensePatch{AmountCents: ptr(int64(5000))}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.inc.Update(ctx, f.a, es[0].ID, IncomeEntryPatch{Confirmed: ptr(true)}); err != nil {
		t.Fatal(err)
	}
	// An entry the user adds by hand is not part of the apply.
	manual := f.expense(f.a, "2026-05-20", 700, nil)

	// User B cannot see or undo A's apply.
	if _, _, err := f.mo.Undo(ctx, f.b, r.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("other user's undo: %v", err)
	}
	applies, err := f.mo.ListApplies(ctx, f.a, "2026-05")
	if err != nil || len(applies) != 1 || applies[0].UnconfirmedCount != 3 {
		t.Fatalf("applies = %+v, %v", applies, err)
	}

	ex, in, err := f.mo.Undo(ctx, f.a, r.ID)
	if err != nil || ex != 2 || in != 1 {
		t.Fatalf("undo = %d, %d, %v", ex, in, err)
	}
	left := f.expenses(f.a, "2026-05")
	ids := map[int64]bool{}
	for _, x := range left {
		ids[x.ID] = true
	}
	if len(left) != 2 || !ids[xs[0].ID] || !ids[manual.ID] {
		t.Fatalf("expenses left = %+v", left)
	}
	if got := f.incomes(f.a, "2026-05"); len(got) != 1 || got[0].ID != es[0].ID {
		t.Fatalf("income left = %+v", got)
	}

	// Undo is safe to call twice; the apply stays, with nothing left to undo.
	if ex, in, err := f.mo.Undo(ctx, f.a, r.ID); err != nil || ex != 0 || in != 0 {
		t.Fatalf("second undo = %d, %d, %v", ex, in, err)
	}
	applies, err = f.mo.ListApplies(ctx, f.a, "2026-05")
	if err != nil || len(applies) != 1 || applies[0].UnconfirmedCount != 0 ||
		applies[0].ExpenseCount != 1 || applies[0].IncomeEntryCount != 1 {
		t.Fatalf("applies after undo = %+v, %v", applies, err)
	}
	if _, _, err := f.mo.Undo(ctx, f.a, 999999); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing apply: %v", err)
	}
}

func TestApplyTemplateToNonEmptyMonth(t *testing.T) {
	f := newMonthFixture(t)
	ctx := context.Background()
	tm := f.newTemplate(f.a, "Month")
	f.expenseItem(f.a, tm.ID, 10)
	f.incomeItem(f.a, tm.ID, 10)

	// Any expense or income entry in the month blocks a plain apply.
	f.income(f.a, "2026-02-27")
	if _, err := f.mo.ApplyTemplate(ctx, f.a, "2026-02", tm.ID, false); !errors.Is(err, ErrMonthNotEmpty) {
		t.Fatalf("income-only month: %v", err)
	}

	// March: an earlier apply (left unconfirmed), a confirmed expense with a
	// refund in April, a refund in March of a February expense, and income.
	earlier := f.apply(f.a, "2026-03", tm.ID, false)
	feb := f.expense(f.a, "2026-02-10", 3000, nil)
	marRefundOfFeb := f.expense(f.a, "2026-03-05", -1000, &feb.ID)
	mar := f.expense(f.a, "2026-03-31", 8000, nil)
	aprRefund := f.expense(f.a, "2026-04-02", -2000, &mar.ID)
	aprOther := f.expense(f.a, "2026-04-03", 450, nil)
	f.income(f.a, "2026-03-01")
	// User B's March is untouched by A's reset.
	bMar := f.expense(f.b, "2026-03-15", 999, nil)

	if _, err := f.mo.ApplyTemplate(ctx, f.a, "2026-03", tm.ID, false); !errors.Is(err, ErrMonthNotEmpty) {
		t.Fatalf("non-empty month: %v", err)
	}
	if n := len(f.expenses(f.a, "2026-03")); n != 3 {
		t.Fatalf("rejected apply changed the month: %d expenses", n)
	}

	r := f.apply(f.a, "2026-03", tm.ID, true)
	if r.RemovedExpenseCount != 3 || r.RemovedIncomeEntryCount != 2 || r.ExpenseCount != 1 || r.IncomeEntryCount != 1 {
		t.Fatalf("reset result = %+v", r)
	}
	xs := f.expenses(f.a, "2026-03")
	if len(xs) != 1 || xs[0].TemplateApplyID == nil || *xs[0].TemplateApplyID != r.ID || xs[0].Date != "2026-03-10" {
		t.Fatalf("march after reset = %+v", xs)
	}
	if es := f.incomes(f.a, "2026-03"); len(es) != 1 || *es[0].TemplateApplyID != r.ID {
		t.Fatalf("march income after reset = %+v", es)
	}
	for _, id := range []int64{marRefundOfFeb.ID, mar.ID} {
		if _, err := f.x.Get(ctx, f.a, id); !errors.Is(err, ErrNotFound) {
			t.Fatalf("march expense %d survived: %v", id, err)
		}
	}

	// Other months are untouched; April's refund is unlinked, not deleted.
	got, err := f.x.Get(ctx, f.a, aprRefund.ID)
	if err != nil || got.RefundedExpenseID != nil || got.AmountCents != -2000 || got.Date != "2026-04-02" {
		t.Fatalf("april refund = %+v, %v", got, err)
	}
	if got, err := f.x.Get(ctx, f.a, aprOther.ID); err != nil || got.AmountCents != 450 {
		t.Fatalf("april expense = %+v, %v", got, err)
	}
	if got, err := f.x.Get(ctx, f.a, feb.ID); err != nil || got.RefundedTotalCents != 0 {
		t.Fatalf("february expense = %+v, %v", got, err)
	}
	if n := len(f.incomes(f.a, "2026-02")); n != 1 {
		t.Fatalf("february income = %d", n)
	}
	if got, err := f.x.Get(ctx, f.b, bMar.ID); err != nil || got.AmountCents != 999 {
		t.Fatalf("user B's expense = %+v, %v", got, err)
	}

	// The month's earlier apply is gone; only the new one is listed.
	applies, err := f.mo.ListApplies(ctx, f.a, "2026-03")
	if err != nil || len(applies) != 1 || applies[0].ID != r.ID {
		t.Fatalf("applies = %+v, %v", applies, err)
	}
	// (SQLite may reuse the deleted row's id, so check the table, not the id.)
	if n := f.count(`SELECT count(*) FROM template_applies WHERE user_id = ?`, f.a); n != 1 {
		t.Fatalf("applies for A = %d, earlier = %+v", n, earlier)
	}

	// Undo after a reset removes only the new copies.
	if ex, in, err := f.mo.Undo(ctx, f.a, r.ID); err != nil || ex != 1 || in != 1 {
		t.Fatalf("undo = %d, %d, %v", ex, in, err)
	}
	if n := len(f.expenses(f.a, "2026-03")); n != 0 {
		t.Fatalf("march after undo = %d", n)
	}

	// Reset on an empty month removes nothing.
	r = f.apply(f.a, "2026-06", tm.ID, true)
	if r.RemovedExpenseCount != 0 || r.RemovedIncomeEntryCount != 0 || r.ExpenseCount != 1 {
		t.Fatalf("empty reset = %+v", r)
	}
}

func TestListAppliesAfterTemplateDeleted(t *testing.T) {
	f := newMonthFixture(t)
	ctx := context.Background()
	tm := f.newTemplate(f.a, "Month")
	f.expenseItem(f.a, tm.ID, 1)
	r := f.apply(f.a, "2026-07", tm.ID, false)
	if err := f.tp.Delete(ctx, f.a, tm.ID); err != nil {
		t.Fatal(err)
	}
	applies, err := f.mo.ListApplies(ctx, f.a, "2026-07")
	if err != nil || len(applies) != 1 || applies[0].ID != r.ID || applies[0].TemplateID != nil ||
		applies[0].TemplateName != nil || applies[0].UnconfirmedCount != 1 {
		t.Fatalf("applies = %+v, %v", applies, err)
	}
	// Other users and other months see nothing.
	if got, err := f.mo.ListApplies(ctx, f.b, "2026-07"); err != nil || len(got) != 0 {
		t.Fatalf("user B applies = %+v, %v", got, err)
	}
	if got, err := f.mo.ListApplies(ctx, f.a, "2026-08"); err != nil || len(got) != 0 {
		t.Fatalf("august applies = %+v, %v", got, err)
	}
	var ve *ValidationError
	if _, err := f.mo.ListApplies(ctx, f.a, "July"); !errors.As(err, &ve) {
		t.Fatalf("bad month: %v", err)
	}
}

func TestConfirmAllInMonth(t *testing.T) {
	f := newMonthFixture(t)
	ctx := context.Background()
	tm := f.newTemplate(f.a, "Month")
	f.expenseItem(f.a, tm.ID, 1)
	f.expenseItem(f.a, tm.ID, 31)
	f.incomeItem(f.a, tm.ID, 15)
	f.apply(f.a, "2026-09", tm.ID, false)
	f.apply(f.a, "2026-10", tm.ID, false)
	// User B's own unconfirmed September copy.
	bt := f.newTemplate(f.b, "B month")
	f.expenseItem(f.b, bt.ID, 1)
	f.apply(f.b, "2026-09", bt.ID, false)

	ex, in, err := f.mo.ConfirmAll(ctx, f.a, "2026-09")
	if err != nil || ex != 2 || in != 1 {
		t.Fatalf("confirm all = %d, %d, %v", ex, in, err)
	}
	for _, x := range f.expenses(f.a, "2026-09") {
		if !x.Confirmed {
			t.Fatalf("unconfirmed = %+v", x)
		}
	}
	for _, x := range f.expenses(f.a, "2026-10") {
		if x.Confirmed {
			t.Fatalf("october confirmed = %+v", x)
		}
	}
	if xs := f.expenses(f.b, "2026-09"); len(xs) != 1 || xs[0].Confirmed {
		t.Fatalf("user B = %+v", xs)
	}
	if ex, in, err := f.mo.ConfirmAll(ctx, f.a, "2026-09"); err != nil || ex != 0 || in != 0 {
		t.Fatalf("second confirm all = %d, %d, %v", ex, in, err)
	}
	var ve *ValidationError
	if _, _, err := f.mo.ConfirmAll(ctx, f.a, "2026-00"); !errors.As(err, &ve) {
		t.Fatalf("bad month: %v", err)
	}
}

func TestSaveMonthAsTemplate(t *testing.T) {
	f := newMonthFixture(t)
	ctx := context.Background()
	food, housing := f.byName(f.a, "Food").ID, f.byName(f.a, "Housing").ID
	rent, err := f.x.Create(ctx, f.a, NewExpense{Date: "2026-04-30", AmountCents: 120000, CategoryID: housing,
		MerchantName: "Landlord", Note: ptr("rent"), Confirmed: false})
	if err != nil {
		t.Fatal(err)
	}
	groceries := f.expense(f.a, "2026-04-03", 4500, nil)
	f.expense(f.a, "2026-04-20", -500, &groceries.ID) // refund: skipped
	f.expense(f.a, "2026-05-01", 999, nil)            // other month: skipped
	f.income(f.a, "2026-04-15")
	f.expense(f.b, "2026-04-10", 111, nil) // other user: skipped

	tm, err := f.mo.SaveAsTemplate(ctx, f.a, "2026-04", "  April ")
	if err != nil {
		t.Fatal(err)
	}
	if tm.Name != "April" || len(tm.ExpenseItems) != 2 || len(tm.IncomeItems) != 1 {
		t.Fatalf("template = %+v", tm)
	}
	e0, e1 := tm.ExpenseItems[0], tm.ExpenseItems[1]
	if e0.DayOfMonth != 3 || e0.AmountCents != 4500 || e0.CategoryID != food || e0.Merchant.Name != "Shop" ||
		e1.DayOfMonth != 30 || e1.AmountCents != 120000 || e1.CategoryID != housing || e1.Merchant.ID != rent.Merchant.ID ||
		e1.Note == nil || *e1.Note != "rent" || e0.SortOrder >= e1.SortOrder {
		t.Fatalf("expense items = %+v", tm.ExpenseItems)
	}
	i0 := tm.IncomeItems[0]
	if i0.DayOfMonth != 15 || i0.SourceID != f.src(f.a, "Other").ID || i0.GrossCents != 10000 ||
		i0.GrossTaxableCents != 9000 || i0.NetCents != 7000 {
		t.Fatalf("income items = %+v", tm.IncomeItems)
	}
	// The month itself is unchanged.
	if n := len(f.expenses(f.a, "2026-04")); n != 3 {
		t.Fatalf("april expenses = %d", n)
	}

	// The saved template applies back onto its days.
	r := f.apply(f.a, "2026-06", tm.ID, false)
	if got := expenseDates(f.expenses(f.a, "2026-06")); r.ExpenseCount != 2 ||
		!reflect.DeepEqual(got, map[string]int{"2026-06-03": 1, "2026-06-30": 1}) {
		t.Fatalf("june = %v (%+v)", got, r)
	}

	if _, err := f.mo.SaveAsTemplate(ctx, f.a, "2026-04", "april"); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("duplicate name: %v", err)
	}
	var ve *ValidationError
	if _, err := f.mo.SaveAsTemplate(ctx, f.a, "2026-04", " "); !errors.As(err, &ve) {
		t.Fatalf("blank name: %v", err)
	}
	if _, err := f.mo.SaveAsTemplate(ctx, f.a, "04-2026", "X"); !errors.As(err, &ve) {
		t.Fatalf("bad month: %v", err)
	}
	// User B may reuse the name; an empty month gives an empty template.
	if bt, err := f.mo.SaveAsTemplate(ctx, f.b, "2026-01", "April"); err != nil ||
		len(bt.ExpenseItems) != 0 || len(bt.IncomeItems) != 0 {
		t.Fatalf("user B = %+v, %v", bt, err)
	}
}

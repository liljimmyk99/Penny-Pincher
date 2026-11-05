package store

import (
	"context"
	"errors"
	"testing"
)

// refund returns a refund for user in category, linked to orig when it is
// non-zero.
func (f *expFixture) refund(user int64, date string, cents int64, category string, orig int64) Expense {
	f.t.Helper()
	in := f.in(user, date, cents, "Shop")
	in.CategoryID = f.byName(user, category).ID
	if orig != 0 {
		in.RefundedExpenseID = &orig
	}
	return f.add(user, in)
}

func (f *expFixture) get(user, id int64) Expense {
	f.t.Helper()
	exp, err := f.x.Get(context.Background(), user, id)
	if err != nil {
		f.t.Fatal(err)
	}
	return exp
}

// categorySpend reads v_monthly_category_spend for one user, month and
// category (zeros when the view has no row).
func (f *expFixture) categorySpend(user int64, month, category string) (total, expenses, refunds int64) {
	f.t.Helper()
	err := f.db.QueryRow(`SELECT COALESCE(SUM(total_cents), 0), COALESCE(SUM(expense_count), 0), COALESCE(SUM(refund_count), 0)
		FROM v_monthly_category_spend WHERE user_id = ? AND year_month = ? AND category_id = ?`,
		user, month, f.byName(user, category).ID).Scan(&total, &expenses, &refunds)
	if err != nil {
		f.t.Fatal(err)
	}
	return total, expenses, refunds
}

func (f *expFixture) monthSpent(user int64, month string) int64 {
	f.t.Helper()
	var spent int64
	err := f.db.QueryRow(`SELECT COALESCE(SUM(spent_cents), 0) FROM v_monthly_totals WHERE user_id = ? AND year_month = ?`,
		user, month).Scan(&spent)
	if err != nil {
		f.t.Fatal(err)
	}
	return spent
}

func (f *expFixture) monthIDs(user int64, month string) map[int64]bool {
	f.t.Helper()
	out, _, err := f.x.List(context.Background(), user, ExpenseFilter{Month: month}, Page{})
	if err != nil {
		f.t.Fatal(err)
	}
	ids := map[int64]bool{}
	for _, e := range out {
		ids[e.ID] = true
	}
	return ids
}

// A refund counts in the month of its own date and in its own category, even
// when the original is in an earlier month (here across a year boundary).
func TestRefundCountsInItsOwnMonthAndCategory(t *testing.T) {
	f := newExpFixture(t)
	orig := f.add(f.a, f.in(f.a, "2025-12-20", 10000, "Shop")) // Food
	ref := f.refund(f.a, "2026-01-05", -2500, "Entertainment", orig.ID)

	if total, n, r := f.categorySpend(f.a, "2025-12", "Food"); total != 10000 || n != 1 || r != 0 {
		t.Errorf("Dec Food = %d (%d expenses, %d refunds), want 10000 (1, 0)", total, n, r)
	}
	if total, n, r := f.categorySpend(f.a, "2026-01", "Entertainment"); total != -2500 || n != 0 || r != 1 {
		t.Errorf("Jan Entertainment = %d (%d expenses, %d refunds), want -2500 (0, 1)", total, n, r)
	}
	if total, _, _ := f.categorySpend(f.a, "2026-01", "Food"); total != 0 {
		t.Errorf("Jan Food = %d, want 0", total)
	}
	if got := f.monthSpent(f.a, "2025-12"); got != 10000 {
		t.Errorf("Dec spent = %d, want 10000", got)
	}
	if got := f.monthSpent(f.a, "2026-01"); got != -2500 {
		t.Errorf("Jan spent = %d, want -2500", got)
	}

	// Listing by month follows the refund's own date.
	if ids := f.monthIDs(f.a, "2025-12"); !ids[orig.ID] || ids[ref.ID] {
		t.Errorf("Dec list = %v", ids)
	}
	if ids := f.monthIDs(f.a, "2026-01"); ids[orig.ID] || !ids[ref.ID] {
		t.Errorf("Jan list = %v", ids)
	}

	// The original's refunded total spans months; nothing is stored on it.
	got := f.get(f.a, orig.ID)
	if got.RefundedTotalCents != -2500 || got.AmountCents != 10000 {
		t.Errorf("original = %+v", got)
	}

	// Moving the refund to a later date moves it to that month.
	if _, err := f.x.Update(context.Background(), f.a, ref.ID, ExpensePatch{Date: ptr("2026-02-01")}); err != nil {
		t.Fatal(err)
	}
	if total, _, _ := f.categorySpend(f.a, "2026-01", "Entertainment"); total != 0 {
		t.Errorf("Jan Entertainment after move = %d", total)
	}
	if total, _, _ := f.categorySpend(f.a, "2026-02", "Entertainment"); total != -2500 {
		t.Errorf("Feb Entertainment after move = %d", total)
	}
}

func TestPartialRefunds(t *testing.T) {
	f := newExpFixture(t)
	ctx := context.Background()
	orig := f.add(f.a, f.in(f.a, "2026-03-10", 9000, "Shop"))
	other := f.add(f.a, f.in(f.a, "2026-03-11", 500, "Shop"))
	r1 := f.refund(f.a, "2026-03-15", -1000, "Food", orig.ID)
	r2 := f.refund(f.a, "2026-04-02", -2000, "Food", orig.ID)
	r3 := f.refund(f.a, "2026-05-20", -500, "Food", orig.ID)
	f.refund(f.a, "2026-03-12", -100, "Food", other.ID)

	if got := f.get(f.a, orig.ID).RefundedTotalCents; got != -3500 {
		t.Fatalf("refunded total = %d, want -3500", got)
	}
	if got := f.get(f.a, other.ID).RefundedTotalCents; got != -100 {
		t.Fatalf("other's refunded total = %d, want -100", got)
	}
	for _, r := range []Expense{r1, r2, r3} {
		if r.RefundedTotalCents != 0 || r.RefundedExpenseID == nil || *r.RefundedExpenseID != orig.ID || r.Type != TypeRefund {
			t.Errorf("refund = %+v", r)
		}
	}

	// Editing or deleting one refund changes the computed total.
	if _, err := f.x.Update(ctx, f.a, r2.ID, ExpensePatch{AmountCents: ptr(int64(-1500))}); err != nil {
		t.Fatal(err)
	}
	if err := f.x.Delete(ctx, f.a, r3.ID); err != nil {
		t.Fatal(err)
	}
	if got := f.get(f.a, orig.ID).RefundedTotalCents; got != -2500 {
		t.Fatalf("refunded total after edits = %d, want -2500", got)
	}
	// Each refund counts in its own month.
	for month, want := range map[string]int64{"2026-03": 9000 + 500 - 1000 - 100, "2026-04": -1500, "2026-05": 0} {
		if got := f.monthSpent(f.a, month); got != want {
			t.Errorf("%s spent = %d, want %d", month, got, want)
		}
	}
	// Lowering the original below its refunds is allowed; nothing is stored.
	if got, err := f.x.Update(ctx, f.a, orig.ID, ExpensePatch{AmountCents: ptr(int64(2000))}); err != nil || got.RefundedTotalCents != -2500 {
		t.Fatalf("lowered original = %+v, %v", got, err)
	}
}

func TestDeletingOriginalUnlinksRefunds(t *testing.T) {
	f := newExpFixture(t)
	ctx := context.Background()
	orig := f.add(f.a, f.in(f.a, "2026-01-31", 4000, "Shop"))
	keep := f.add(f.a, f.in(f.a, "2026-01-30", 700, "Shop"))
	r1 := f.refund(f.a, "2026-02-03", -1000, "Housing", orig.ID)
	r2 := f.refund(f.a, "2026-03-04", -500, "Food", orig.ID)
	kr := f.refund(f.a, "2026-02-05", -200, "Food", keep.ID)

	if err := f.x.Delete(ctx, f.a, orig.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.x.Get(ctx, f.a, orig.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("original after delete: %v", err)
	}
	// The refunds stay, unlinked, with their own date, amount and category.
	for _, want := range []Expense{r1, r2} {
		got := f.get(f.a, want.ID)
		if got.RefundedExpenseID != nil || got.AmountCents != want.AmountCents || got.Date != want.Date ||
			got.CategoryID != want.CategoryID || got.Merchant != want.Merchant {
			t.Errorf("refund after delete = %+v, want %+v unlinked", got, want)
		}
	}
	// Refunds of other expenses are untouched.
	if got := f.get(f.a, kr.ID); got.RefundedExpenseID == nil || *got.RefundedExpenseID != keep.ID {
		t.Errorf("other refund = %+v", got)
	}
	if got := f.get(f.a, keep.ID).RefundedTotalCents; got != -200 {
		t.Errorf("other refunded total = %d", got)
	}
	// They still count in their own months.
	if total, _, r := f.categorySpend(f.a, "2026-02", "Housing"); total != -1000 || r != 1 {
		t.Errorf("Feb Housing = %d (%d refunds)", total, r)
	}
	if got := f.monthSpent(f.a, "2026-01"); got != 700 {
		t.Errorf("Jan spent = %d, want 700", got)
	}
	// An unlinked refund can be linked again, to another expense.
	got, err := f.x.Update(ctx, f.a, r1.ID, ExpensePatch{SetRefundedExpenseID: true, RefundedExpenseID: &keep.ID})
	if err != nil || got.RefundedExpenseID == nil || *got.RefundedExpenseID != keep.ID {
		t.Fatalf("relink = %+v, %v", got, err)
	}
}

func TestRelinkingRefunds(t *testing.T) {
	f := newExpFixture(t)
	ctx := context.Background()
	a1 := f.add(f.a, f.in(f.a, "2026-03-01", 1000, "Shop"))
	a2 := f.add(f.a, f.in(f.a, "2026-03-02", 2000, "Shop"))
	theirs := f.add(f.b, f.in(f.b, "2026-03-01", 1000, "Shop"))
	loose := f.refund(f.a, "2026-04-01", -300, "Food", 0)
	otherRefund := f.refund(f.a, "2026-04-02", -50, "Food", 0)

	link := func(id int64, to *int64) (Expense, error) {
		return f.x.Update(ctx, f.a, id, ExpensePatch{SetRefundedExpenseID: true, RefundedExpenseID: to})
	}
	// Link an existing refund, then move it to another original.
	if got, err := link(loose.ID, &a1.ID); err != nil || *got.RefundedExpenseID != a1.ID {
		t.Fatalf("link = %+v, %v", got, err)
	}
	if got, err := link(loose.ID, &a2.ID); err != nil || *got.RefundedExpenseID != a2.ID {
		t.Fatalf("move = %+v, %v", got, err)
	}
	if got := f.get(f.a, a1.ID).RefundedTotalCents; got != 0 {
		t.Errorf("a1 total after move = %d", got)
	}
	if got := f.get(f.a, a2.ID).RefundedTotalCents; got != -300 {
		t.Errorf("a2 total after move = %d", got)
	}

	// Rejected: another user's expense, a refund, a missing expense, a
	// positive amount, and itself.
	for name, to := range map[string]int64{
		"another user's expense": theirs.ID,
		"a refund":               otherRefund.ID,
		"a missing expense":      999999,
		"itself":                 loose.ID,
	} {
		if _, err := link(loose.ID, &to); !errors.Is(err, ErrInvalidRefundLink) {
			t.Errorf("link to %s: %v", name, err)
		}
	}
	if _, err := link(a1.ID, &a2.ID); !errors.Is(err, ErrInvalidRefundLink) {
		t.Errorf("link on a positive amount: %v", err)
	}
	// Another user cannot link or unlink A's refund.
	if _, err := f.x.Update(ctx, f.b, loose.ID, ExpensePatch{SetRefundedExpenseID: true, RefundedExpenseID: &theirs.ID}); !errors.Is(err, ErrNotFound) {
		t.Errorf("B relinks A's refund: %v", err)
	}
	if got := f.get(f.a, loose.ID); *got.RefundedExpenseID != a2.ID {
		t.Errorf("refund after rejected links = %+v", got)
	}
	// Making a linked refund positive is rejected; clearing the link in the
	// same edit makes it an ordinary expense.
	if _, err := f.x.Update(ctx, f.a, loose.ID, ExpensePatch{AmountCents: ptr(int64(300))}); !errors.Is(err, ErrInvalidRefundLink) {
		t.Errorf("linked refund made positive: %v", err)
	}
	got, err := f.x.Update(ctx, f.a, loose.ID, ExpensePatch{AmountCents: ptr(int64(300)), SetRefundedExpenseID: true})
	if err != nil || got.Type != TypeExpense || got.RefundedExpenseID != nil {
		t.Fatalf("unlinked and made positive = %+v, %v", got, err)
	}
	// A refund in a batch may link to an existing expense.
	in := f.in(f.a, "2026-05-01", -100, "Shop")
	in.RefundedExpenseID = &a1.ID
	if _, err := f.x.CreateBatch(ctx, f.a, []NewExpense{f.in(f.a, "2026-05-01", 100, "Shop"), in}); err != nil {
		t.Fatal(err)
	}
	if got := f.get(f.a, a1.ID).RefundedTotalCents; got != -100 {
		t.Errorf("a1 total after batch = %d", got)
	}
}

// The triggers and foreign key keep the refund rules even for writes that skip
// the store's checks.
func TestRefundLinkSafetyNet(t *testing.T) {
	f := newExpFixture(t)
	ctx := context.Background()
	mine := f.add(f.a, f.in(f.a, "2026-03-01", 1000, "Shop"))
	theirs := f.add(f.b, f.in(f.b, "2026-03-01", 1000, "Shop"))
	ref := f.refund(f.a, "2026-03-02", -100, "Food", mine.ID)
	loose := f.refund(f.a, "2026-03-03", -100, "Food", 0)

	insert := func(link int64) error {
		_, err := f.db.ExecContext(ctx, `INSERT INTO expenses
			(user_id, category_id, merchant_id, occurred_on, amount_cents, refunded_expense_id)
			VALUES (?, ?, ?, '2026-03-04', -50, ?)`, f.a, mine.CategoryID, mine.Merchant.ID, link)
		return mapConstraint(err)
	}
	if err := insert(theirs.ID); !errors.Is(err, ErrInvalidRefundLink) {
		t.Errorf("insert linked to another user's expense: %v", err)
	}
	if err := insert(ref.ID); !errors.Is(err, ErrInvalidRefundLink) {
		t.Errorf("insert linked to a refund: %v", err)
	}
	_, err := f.db.ExecContext(ctx, `UPDATE expenses SET refunded_expense_id = ? WHERE id = ?`, theirs.ID, loose.ID)
	if err := mapConstraint(err); !errors.Is(err, ErrInvalidRefundLink) {
		t.Errorf("update linked to another user's expense: %v", err)
	}
	_, err = f.db.ExecContext(ctx, `UPDATE expenses SET amount_cents = -1000 WHERE id = ?`, mine.ID)
	if err := mapConstraint(err); !errors.Is(err, ErrHasLinkedRefunds) {
		t.Errorf("original made negative: %v", err)
	}

	// A plain DELETE (as a month reset does) still unlinks rather than deletes.
	if _, err := f.db.ExecContext(ctx, `DELETE FROM expenses WHERE id = ?`, mine.ID); err != nil {
		t.Fatal(err)
	}
	if got := f.get(f.a, ref.ID); got.RefundedExpenseID != nil || got.AmountCents != -100 {
		t.Errorf("refund after raw delete = %+v", got)
	}
}

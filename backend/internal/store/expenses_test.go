package store

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// expFixture is a database with two seeded users, A and B.
type expFixture struct {
	*catFixture
	x Expenses
	m Merchants
}

func newExpFixture(t *testing.T) *expFixture {
	t.Helper()
	cf := newCatFixture(t)
	return &expFixture{catFixture: cf, x: Expenses{DB: cf.db}, m: Merchants{DB: cf.db}}
}

// in returns a valid expense for user in category "Food".
func (f *expFixture) in(user int64, date string, cents int64, merchant string) NewExpense {
	return NewExpense{Date: date, AmountCents: cents, CategoryID: f.byName(user, "Food").ID, MerchantName: merchant, Confirmed: true}
}

func (f *expFixture) add(user int64, in NewExpense) Expense {
	f.t.Helper()
	exp, err := f.x.Create(context.Background(), user, in)
	if err != nil {
		f.t.Fatal(err)
	}
	return exp
}

func TestCreateExpense(t *testing.T) {
	f := newExpFixture(t)
	in := f.in(f.a, "2026-03-14", 1250, "  Corner Cafe ")
	in.Note = ptr("  lunch ")
	exp := f.add(f.a, in)

	if exp.ID == 0 || exp.Date != "2026-03-14" || exp.AmountCents != 1250 || exp.Type != TypeExpense ||
		exp.CategoryID != in.CategoryID || exp.Merchant.Name != "Corner Cafe" || exp.Note == nil || *exp.Note != "lunch" ||
		exp.RefundedExpenseID != nil || exp.RefundedTotalCents != 0 || !exp.Confirmed || exp.TemplateApplyID != nil ||
		exp.CreatedAt.IsZero() || exp.UpdatedAt.IsZero() {
		t.Fatalf("created = %+v", exp)
	}
	got, err := f.x.Get(context.Background(), f.a, exp.ID)
	if err != nil || got.ID != exp.ID || got.Merchant != exp.Merchant {
		t.Fatalf("get = %+v, %v", got, err)
	}

	// A blank note is stored as NULL; confirmed=false is kept.
	in = f.in(f.a, "2026-03-15", 300, "Corner Cafe")
	in.Note, in.Confirmed = ptr("   "), false
	if exp := f.add(f.a, in); exp.Note != nil || exp.Confirmed {
		t.Fatalf("created = %+v", exp)
	}
}

func TestExpenseTypeDerivedFromSign(t *testing.T) {
	f := newExpFixture(t)
	ctx := context.Background()
	exp := f.add(f.a, f.in(f.a, "2026-03-01", 500, "Shop"))
	ref := f.add(f.a, f.in(f.a, "2026-03-02", -200, "Shop"))
	if exp.Type != TypeExpense || ref.Type != TypeRefund {
		t.Fatalf("types = %q, %q", exp.Type, ref.Type)
	}
	got, err := f.x.Update(ctx, f.a, exp.ID, ExpensePatch{AmountCents: ptr(int64(-500))})
	if err != nil || got.Type != TypeRefund {
		t.Fatalf("update = %+v, %v", got, err)
	}
}

func TestCreateExpenseValidation(t *testing.T) {
	f := newExpFixture(t)
	ctx := context.Background()
	for field, mod := range map[string]func(*NewExpense){
		"date":          func(in *NewExpense) { in.Date = "2026-02-30" },
		"amount_cents":  func(in *NewExpense) { in.AmountCents = 0 },
		"merchant_name": func(in *NewExpense) { in.MerchantName = "  " },
		"note":          func(in *NewExpense) { in.Note = ptr(strings.Repeat("n", 501)) },
		"category_id":   func(in *NewExpense) { in.CategoryID = f.byName(f.b, "Food").ID }, // B's category
	} {
		in := f.in(f.a, "2026-03-01", 100, "Shop")
		mod(&in)
		_, err := f.x.Create(ctx, f.a, in)
		wantValidation(t, err, field)
	}
	in := f.in(f.a, "2026-03-01", 100, strings.Repeat("m", 101))
	_, err := f.x.Create(ctx, f.a, in)
	wantValidation(t, err, "merchant_name")
	if n := f.count(`SELECT count(*) FROM expenses`); n != 0 {
		t.Fatalf("%d expenses saved", n)
	}
	if n := f.count(`SELECT count(*) FROM merchants`); n != 0 {
		t.Fatalf("%d merchants saved", n)
	}
}

func TestMerchantMatchedCaseInsensitively(t *testing.T) {
	f := newExpFixture(t)
	first := f.add(f.a, f.in(f.a, "2026-03-01", 100, "Corner Cafe"))
	for _, name := range []string{"corner cafe", "CORNER CAFE", "  Corner Cafe  "} {
		exp := f.add(f.a, f.in(f.a, "2026-03-02", 100, name))
		if exp.Merchant != first.Merchant {
			t.Fatalf("%q -> %+v, want %+v", name, exp.Merchant, first.Merchant)
		}
	}
	if n := f.count(`SELECT count(*) FROM merchants WHERE user_id = ?`, f.a); n != 1 {
		t.Fatalf("merchants = %d", n)
	}

	// The same name for another user is that user's own merchant.
	theirs := f.add(f.b, f.in(f.b, "2026-03-01", 100, "corner cafe"))
	if theirs.Merchant.ID == first.Merchant.ID || theirs.Merchant.Name != "corner cafe" {
		t.Fatalf("B's merchant = %+v", theirs.Merchant)
	}

	// Editing the merchant name matches or creates the same way.
	got, err := f.x.Update(context.Background(), f.a, theirs.ID, ExpensePatch{MerchantName: ptr("CORNER CAFE")})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("A updating B's expense: %+v, %v", got, err)
	}
	got, err = f.x.Update(context.Background(), f.b, theirs.ID, ExpensePatch{MerchantName: ptr("Bakery")})
	if err != nil || got.Merchant.Name != "Bakery" || got.Merchant.ID == theirs.Merchant.ID {
		t.Fatalf("update merchant = %+v, %v", got.Merchant, err)
	}
}

func TestCreateBatchIsAllOrNothing(t *testing.T) {
	f := newExpFixture(t)
	ctx := context.Background()
	f.add(f.a, f.in(f.a, "2026-03-01", 100, "Existing"))

	bad := []NewExpense{
		f.in(f.a, "2026-03-02", 100, "New Merchant"),
		f.in(f.a, "2026-03-03", 200, "existing"),
		f.in(f.a, "2026-03-04", 0, "Another New"),
	}
	_, err := f.x.CreateBatch(ctx, f.a, bad)
	var be *BatchItemError
	if !errors.As(err, &be) || be.Index != 2 {
		t.Fatalf("err = %v, want item 2", err)
	}
	wantValidation(t, err, "amount_cents")
	if n := f.count(`SELECT count(*) FROM expenses WHERE user_id = ?`, f.a); n != 1 {
		t.Fatalf("expenses = %d, want only the existing one", n)
	}
	if n := f.count(`SELECT count(*) FROM merchants WHERE user_id = ?`, f.a); n != 1 {
		t.Fatalf("merchants = %d, want the new merchant rolled back", n)
	}

	// A refund link failing mid-batch rolls back too.
	link := f.in(f.a, "2026-03-05", -50, "Existing")
	link.RefundedExpenseID = ptr(int64(999))
	_, err = f.x.CreateBatch(ctx, f.a, []NewExpense{bad[0], link})
	if !errors.As(err, &be) || be.Index != 1 || !errors.Is(err, ErrInvalidRefundLink) {
		t.Fatalf("err = %v", err)
	}
	if n := f.count(`SELECT count(*) FROM expenses WHERE user_id = ?`, f.a); n != 1 {
		t.Fatalf("expenses = %d", n)
	}

	good := bad[:2]
	out, err := f.x.CreateBatch(ctx, f.a, good)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 2 || out[0].Date != "2026-03-02" || out[1].Date != "2026-03-03" ||
		out[1].Merchant.Name != "Existing" || out[0].Merchant.Name != "New Merchant" {
		t.Fatalf("batch = %+v", out)
	}
}

func TestExpensesScopedToUser(t *testing.T) {
	f := newExpFixture(t)
	ctx := context.Background()
	mine := f.add(f.a, f.in(f.a, "2026-03-01", 100, "Shop"))

	if _, err := f.x.Get(ctx, f.b, mine.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get: %v", err)
	}
	if _, err := f.x.Update(ctx, f.b, mine.ID, ExpensePatch{AmountCents: ptr(int64(1))}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("update: %v", err)
	}
	if err := f.x.Delete(ctx, f.b, mine.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete: %v", err)
	}
	list, _, err := f.x.List(ctx, f.b, ExpenseFilter{}, Page{})
	if err != nil || len(list) != 0 {
		t.Fatalf("B's list = %+v, %v", list, err)
	}
	// B cannot file an expense under A's category or link a refund to A's expense.
	in := f.in(f.b, "2026-03-01", 100, "Shop")
	in.CategoryID = mine.CategoryID
	_, err = f.x.Create(ctx, f.b, in)
	wantValidation(t, err, "category_id")
	ref := f.in(f.b, "2026-03-01", -100, "Shop")
	ref.RefundedExpenseID = &mine.ID
	if _, err := f.x.Create(ctx, f.b, ref); !errors.Is(err, ErrInvalidRefundLink) {
		t.Fatalf("link to A's expense: %v", err)
	}
	if got, err := f.x.Get(ctx, f.a, mine.ID); err != nil || got.AmountCents != 100 {
		t.Fatalf("A's expense = %+v, %v", got, err)
	}
}

func TestUpdateExpense(t *testing.T) {
	f := newExpFixture(t)
	ctx := context.Background()
	in := f.in(f.a, "2026-03-01", 100, "Shop")
	in.Note, in.Confirmed = ptr("note"), false
	exp := f.add(f.a, in)

	if _, err := f.x.Update(ctx, f.a, exp.ID, ExpensePatch{}); err == nil {
		t.Fatal("empty patch accepted")
	}

	// confirmed:false keeps it unconfirmed while editing.
	got, err := f.x.Update(ctx, f.a, exp.ID, ExpensePatch{AmountCents: ptr(int64(150)), Confirmed: ptr(false)})
	if err != nil || got.AmountCents != 150 || got.Confirmed {
		t.Fatalf("update = %+v, %v", got, err)
	}
	// Any other edit confirms it. Untouched fields stay.
	housing := f.byName(f.a, "Housing").ID
	got, err = f.x.Update(ctx, f.a, exp.ID, ExpensePatch{Date: ptr("2026-04-30"), CategoryID: &housing})
	if err != nil || !got.Confirmed || got.Date != "2026-04-30" || got.CategoryID != housing ||
		got.AmountCents != 150 || got.Note == nil || *got.Note != "note" || got.Merchant.Name != "Shop" {
		t.Fatalf("update = %+v, %v", got, err)
	}
	// SetNote with nil clears it.
	got, err = f.x.Update(ctx, f.a, exp.ID, ExpensePatch{SetNote: true})
	if err != nil || got.Note != nil {
		t.Fatalf("clear note = %+v, %v", got, err)
	}

	for field, p := range map[string]ExpensePatch{
		"date":          {Date: ptr("2026-13-01")},
		"amount_cents":  {AmountCents: ptr(int64(0))},
		"merchant_name": {MerchantName: ptr("")},
		"category_id":   {CategoryID: ptr(f.byName(f.b, "Food").ID)},
	} {
		_, err := f.x.Update(ctx, f.a, exp.ID, p)
		wantValidation(t, err, field)
	}
	if _, err := f.x.Update(ctx, f.a, 9999, ExpensePatch{AmountCents: ptr(int64(1))}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing: %v", err)
	}
}

func TestRefundLinkBasics(t *testing.T) {
	f := newExpFixture(t)
	ctx := context.Background()
	orig := f.add(f.a, f.in(f.a, "2026-03-01", 1000, "Shop"))

	r1 := f.in(f.a, "2026-04-02", -300, "Shop")
	r1.RefundedExpenseID = &orig.ID
	ref1 := f.add(f.a, r1)
	r2 := f.in(f.a, "2026-04-03", -200, "Shop")
	r2.RefundedExpenseID = &orig.ID
	ref2 := f.add(f.a, r2)

	got, err := f.x.Get(ctx, f.a, orig.ID)
	if err != nil || got.RefundedTotalCents != -500 {
		t.Fatalf("original = %+v, %v", got, err)
	}
	if ref1.RefundedTotalCents != 0 || *ref1.RefundedExpenseID != orig.ID {
		t.Fatalf("refund = %+v", ref1)
	}

	// A link needs a negative amount and a positive target other than itself.
	pos := f.in(f.a, "2026-04-04", 100, "Shop")
	pos.RefundedExpenseID = &orig.ID
	if _, err := f.x.Create(ctx, f.a, pos); !errors.Is(err, ErrInvalidRefundLink) {
		t.Fatalf("positive with link: %v", err)
	}
	toRefund := f.in(f.a, "2026-04-04", -100, "Shop")
	toRefund.RefundedExpenseID = &ref1.ID
	if _, err := f.x.Create(ctx, f.a, toRefund); !errors.Is(err, ErrInvalidRefundLink) {
		t.Fatalf("link to a refund: %v", err)
	}
	if _, err := f.x.Update(ctx, f.a, ref1.ID, ExpensePatch{AmountCents: ptr(int64(300))}); !errors.Is(err, ErrInvalidRefundLink) {
		t.Fatalf("linked refund made positive: %v", err)
	}
	if _, err := f.x.Update(ctx, f.a, ref1.ID, ExpensePatch{SetRefundedExpenseID: true, RefundedExpenseID: &ref1.ID}); !errors.Is(err, ErrInvalidRefundLink) {
		t.Fatalf("self link: %v", err)
	}
	// The original cannot turn into a refund while refunds point at it.
	if _, err := f.x.Update(ctx, f.a, orig.ID, ExpensePatch{AmountCents: ptr(int64(-1000))}); !errors.Is(err, ErrHasLinkedRefunds) {
		t.Fatalf("negative original: %v", err)
	}

	// Unlinking via patch.
	got, err = f.x.Update(ctx, f.a, ref2.ID, ExpensePatch{SetRefundedExpenseID: true})
	if err != nil || got.RefundedExpenseID != nil {
		t.Fatalf("unlink = %+v, %v", got, err)
	}
	// Deleting the original unlinks its refunds and keeps them.
	if err := f.x.Delete(ctx, f.a, orig.ID); err != nil {
		t.Fatal(err)
	}
	got, err = f.x.Get(ctx, f.a, ref1.ID)
	if err != nil || got.RefundedExpenseID != nil || got.AmountCents != -300 {
		t.Fatalf("refund after delete = %+v, %v", got, err)
	}
	if _, err := f.x.Get(ctx, f.a, orig.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted original: %v", err)
	}
}

func TestListExpensesFilters(t *testing.T) {
	f := newExpFixture(t)
	ctx := context.Background()
	housing := f.byName(f.a, "Housing").ID
	e1 := f.add(f.a, f.in(f.a, "2026-02-28", 100, "Shop"))
	e2 := f.add(f.a, f.in(f.a, "2026-03-01", 200, "Shop"))
	e3 := f.add(f.a, f.in(f.a, "2026-03-01", -50, "Bakery"))
	in := f.in(f.a, "2026-03-31", 400, "Bakery")
	in.CategoryID, in.Confirmed = housing, false
	e4 := f.add(f.a, in)
	e5 := f.add(f.a, f.in(f.a, "2026-04-01", 500, "Shop"))
	f.add(f.b, f.in(f.b, "2026-03-15", 999, "Shop"))

	names := map[int64]string{e1.ID: "e1", e2.ID: "e2", e3.ID: "e3", e4.ID: "e4", e5.ID: "e5"}
	list := func(filter ExpenseFilter) string {
		t.Helper()
		out, next, err := f.x.List(ctx, f.a, filter, Page{})
		if err != nil || next != "" {
			t.Fatalf("list(%+v) = %v, %q", filter, err, next)
		}
		var s []string
		for _, e := range out {
			s = append(s, names[e.ID])
		}
		return strings.Join(s, ",")
	}
	shop := e1.Merchant.ID
	for _, c := range []struct {
		f    ExpenseFilter
		want string
	}{
		// Date descending, then newest first.
		{ExpenseFilter{}, "e5,e4,e3,e2,e1"},
		{ExpenseFilter{Month: "2026-03"}, "e4,e3,e2"},
		{ExpenseFilter{From: "2026-03-01"}, "e5,e4,e3,e2"},
		{ExpenseFilter{To: "2026-03-01"}, "e3,e2,e1"},
		{ExpenseFilter{From: "2026-03-01", To: "2026-03-30"}, "e3,e2"},
		{ExpenseFilter{CategoryID: &housing}, "e4"},
		{ExpenseFilter{MerchantID: &shop}, "e5,e2,e1"},
		{ExpenseFilter{Type: TypeRefund}, "e3"},
		{ExpenseFilter{Type: TypeExpense, Month: "2026-03"}, "e4,e2"},
		{ExpenseFilter{Confirmed: ptr(false)}, "e4"},
		{ExpenseFilter{CategoryID: ptr(int64(0))}, ""},
	} {
		if got := list(c.f); got != c.want {
			t.Errorf("list(%+v) = %s, want %s", c.f, got, c.want)
		}
	}

	for field, filter := range map[string]ExpenseFilter{
		"month": {Month: "2026-3"},
		"from":  {From: "2026-04-02", To: "2026-04-01"},
		"to":    {To: "yesterday"},
		"type":  {Type: "income"},
	} {
		_, _, err := f.x.List(ctx, f.a, filter, Page{})
		wantValidation(t, err, field)
	}
	_, _, err := f.x.List(ctx, f.a, ExpenseFilter{Month: "2026-03", From: "2026-03-01"}, Page{})
	wantValidation(t, err, "month")
}

func TestListExpensesPages(t *testing.T) {
	f := newExpFixture(t)
	ctx := context.Background()
	for _, d := range []string{"2026-03-01", "2026-03-02", "2026-03-02", "2026-03-02", "2026-03-03"} {
		f.add(f.a, f.in(f.a, d, 100, "Shop"))
	}
	all, next, err := f.x.List(ctx, f.a, ExpenseFilter{}, Page{})
	if err != nil || len(all) != 5 || next != "" {
		t.Fatalf("all = %d, %q, %v", len(all), next, err)
	}
	var paged []Expense
	page := Page{Limit: 2}
	for i := 0; ; i++ {
		out, next, err := f.x.List(ctx, f.a, ExpenseFilter{}, page)
		if err != nil {
			t.Fatal(err)
		}
		paged = append(paged, out...)
		if next == "" {
			break
		}
		if i > 5 {
			t.Fatal("too many pages")
		}
		page.Cursor = next
	}
	if len(paged) != len(all) {
		t.Fatalf("paged %d, want %d", len(paged), len(all))
	}
	for i := range all {
		if paged[i].ID != all[i].ID {
			t.Fatalf("page order differs at %d", i)
		}
	}

	for _, p := range []Page{{Limit: -1}, {Limit: 1001}} {
		_, _, err := f.x.List(ctx, f.a, ExpenseFilter{}, p)
		wantValidation(t, err, "limit")
	}
	for _, c := range []string{"not base64!", encodeCursor("2026-03-01"), encodeCursor("2026-03-01", "x")} {
		_, _, err := f.x.List(ctx, f.a, ExpenseFilter{}, Page{Cursor: c})
		wantValidation(t, err, "cursor")
	}
}

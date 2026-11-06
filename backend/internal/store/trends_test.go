package store

import (
	"context"
	"errors"
	"testing"
)

type trendFixture struct {
	*monthFixture
	tr Trends
	st SavedTrends
}

func newTrendFixture(t *testing.T) *trendFixture {
	mf := newMonthFixture(t)
	return &trendFixture{monthFixture: mf, tr: Trends{DB: mf.db}, st: SavedTrends{DB: mf.db}}
}

func (f *trendFixture) merchantID(user int64, name string) int64 {
	f.t.Helper()
	var id int64
	if err := f.db.QueryRow(`SELECT id FROM merchants WHERE user_id = ? AND name = ?`, user, name).Scan(&id); err != nil {
		f.t.Fatal(err)
	}
	return id
}

func (f *trendFixture) spend(user int64, date string, cents int64, cat, merchant, note string) Expense {
	f.t.Helper()
	var n *string
	if note != "" {
		n = &note
	}
	e, err := f.x.Create(context.Background(), user, NewExpense{
		Date: date, AmountCents: cents, CategoryID: f.byName(user, cat).ID, MerchantName: merchant,
		Note: n, Confirmed: true,
	})
	if err != nil {
		f.t.Fatal(err)
	}
	return e
}

func bucketsOf(tr Trend) map[string]TrendBucket {
	m := map[string]TrendBucket{}
	for _, b := range tr.Buckets {
		m[b.Period] = b
	}
	return m
}

func TestCustomTrendFilters(t *testing.T) {
	f := newTrendFixture(t)
	ctx := context.Background()
	food, house := f.byName(f.a, "Food").ID, f.byName(f.a, "Housing").ID

	f.spend(f.a, "2025-12-20", 1000, "Food", "Cafe", "Lunch with Sam")
	f.spend(f.a, "2026-01-05", 2000, "Food", "Cafe", "")
	f.spend(f.a, "2026-01-06", 500, "Food", "Market", "weekly LUNCH box")
	f.spend(f.a, "2026-03-09", 7000, "Housing", "Landlord", "")
	// Another user's data with the same names never leaks in.
	f.spend(f.b, "2026-01-05", 99999, "Food", "Cafe", "lunch")

	from, to := "2025-12-01", "2026-03-31"
	run := func(fl TrendFilter) map[string]TrendBucket {
		t.Helper()
		fl.From, fl.To = from, to
		tr, err := f.tr.Custom(ctx, f.a, fl)
		if err != nil {
			t.Fatal(err)
		}
		if len(tr.Buckets) != 4 || tr.GroupBy != "month" {
			t.Fatalf("buckets = %+v group=%s", tr.Buckets, tr.GroupBy)
		}
		return bucketsOf(tr)
	}

	// Category: zero-filled February, both measures.
	b := run(TrendFilter{CategoryID: &food})
	if b["2025-12"] != (TrendBucket{"2025-12", 1000, 1}) || b["2026-01"] != (TrendBucket{"2026-01", 2500, 2}) ||
		b["2026-02"] != (TrendBucket{"2026-02", 0, 0}) || b["2026-03"].TotalCents != 0 {
		t.Errorf("category = %+v", b)
	}
	if b := run(TrendFilter{CategoryID: &house}); b["2026-03"].TotalCents != 7000 || b["2026-01"].Count != 0 {
		t.Errorf("housing = %+v", b)
	}
	// Merchant.
	cafe := f.merchantID(f.a, "Cafe")
	if b := run(TrendFilter{MerchantID: &cafe}); b["2026-01"] != (TrendBucket{"2026-01", 2000, 1}) || b["2025-12"].TotalCents != 1000 {
		t.Errorf("merchant = %+v", b)
	}
	// Note text: case-insensitive substring.
	if b := run(TrendFilter{Text: "lunch"}); b["2025-12"].TotalCents != 1000 || b["2026-01"] != (TrendBucket{"2026-01", 500, 1}) {
		t.Errorf("text = %+v", b)
	}
	// % is literal, not a wildcard.
	if b := run(TrendFilter{Text: "%"}); b["2025-12"].Count != 0 || b["2026-01"].Count != 0 {
		t.Errorf("percent matched: %+v", b)
	}
	// Combined filters are ANDed.
	if b := run(TrendFilter{CategoryID: &food, MerchantID: &cafe, Text: "sam"}); b["2025-12"].Count != 1 || b["2026-01"].Count != 0 {
		t.Errorf("combined = %+v", b)
	}
}

func TestCustomTrendDateRangeAndYears(t *testing.T) {
	f := newTrendFixture(t)
	ctx := context.Background()
	food := f.byName(f.a, "Food").ID
	f.spend(f.a, "2024-06-30", 100, "Food", "Cafe", "")
	f.spend(f.a, "2025-01-01", 200, "Food", "Cafe", "")
	f.spend(f.a, "2025-12-31", 300, "Food", "Cafe", "")
	f.spend(f.a, "2026-01-01", 400, "Food", "Cafe", "")

	tr, err := f.tr.Custom(ctx, f.a, TrendFilter{CategoryID: &food, From: "2024-01-01", To: "2026-06-30", GroupBy: "year"})
	if err != nil {
		t.Fatal(err)
	}
	want := []TrendBucket{{"2024", 100, 1}, {"2025", 500, 2}, {"2026", 400, 1}}
	if len(tr.Buckets) != 3 || tr.Buckets[0] != want[0] || tr.Buckets[1] != want[1] || tr.Buckets[2] != want[2] {
		t.Errorf("years = %+v", tr.Buckets)
	}

	// Range ends are inclusive and nothing outside is counted.
	tr, _ = f.tr.Custom(ctx, f.a, TrendFilter{CategoryID: &food, From: "2025-01-01", To: "2025-12-30"})
	if len(tr.Buckets) != 12 || tr.Buckets[0].TotalCents != 200 || tr.Buckets[11].TotalCents != 0 {
		t.Errorf("range = %+v", tr.Buckets)
	}
}

func TestCustomTrendRefundsAndCounts(t *testing.T) {
	f := newTrendFixture(t)
	ctx := context.Background()
	food := f.byName(f.a, "Food").ID
	orig := f.spend(f.a, "2026-01-10", 5000, "Food", "Shop", "")
	f.x.Create(ctx, f.a, NewExpense{ // refund logged in a later month
		Date: "2026-02-03", AmountCents: -1500, CategoryID: food, MerchantName: "Shop",
		RefundedExpenseID: &orig.ID, Confirmed: true,
	})
	tr, err := f.tr.Custom(ctx, f.a, TrendFilter{CategoryID: &food, From: "2026-01-01", To: "2026-02-28"})
	if err != nil {
		t.Fatal(err)
	}
	b := bucketsOf(tr)
	if b["2026-01"] != (TrendBucket{"2026-01", 5000, 1}) {
		t.Errorf("jan = %+v", b["2026-01"])
	}
	// The refund lowers February's total but is not a transaction.
	if b["2026-02"] != (TrendBucket{"2026-02", -1500, 0}) {
		t.Errorf("feb = %+v", b["2026-02"])
	}
}

func TestCustomTrendValidation(t *testing.T) {
	f := newTrendFixture(t)
	ctx := context.Background()
	food := f.byName(f.a, "Food").ID
	cases := map[string]TrendFilter{
		"no filter":     {From: "2026-01-01", To: "2026-02-01"},
		"blank text":    {Text: "  ", From: "2026-01-01", To: "2026-02-01"},
		"bad from":      {CategoryID: &food, From: "2026-1-1", To: "2026-02-01"},
		"bad to":        {CategoryID: &food, From: "2026-01-01", To: ""},
		"from after to": {CategoryID: &food, From: "2026-03-01", To: "2026-02-01"},
		"bad group":     {CategoryID: &food, From: "2026-01-01", To: "2026-02-01", GroupBy: "week"},
		"too long":      {CategoryID: &food, From: "1000-01-01", To: "2026-02-01"},
	}
	for name, fl := range cases {
		_, err := f.tr.Custom(ctx, f.a, fl)
		var ve *ValidationError
		if !errors.As(err, &ve) {
			t.Errorf("%s: err = %v", name, err)
		}
	}
	// Another user's category id is not an error, it just matches nothing.
	f.spend(f.a, "2026-01-05", 100, "Food", "Cafe", "")
	bFood := f.byName(f.b, "Food").ID
	tr, err := f.tr.Custom(ctx, f.a, TrendFilter{CategoryID: &bFood, From: "2026-01-01", To: "2026-01-31"})
	if err != nil || tr.Buckets[0].TotalCents != 0 || tr.Buckets[0].Count != 0 {
		t.Errorf("foreign category = %+v, %v", tr, err)
	}
}

func TestSavedTrendsCRUD(t *testing.T) {
	f := newTrendFixture(t)
	ctx := context.Background()
	f.spend(f.a, "2026-01-05", 100, "Food", "Cafe", "")
	cafe, food := f.merchantID(f.a, "Cafe"), f.byName(f.a, "Food").ID
	txt := "  lunch "

	m, err := f.st.Create(ctx, f.a, NewSavedTrend{Name: " Coffee ", MatchType: "merchant", MerchantID: &cafe, Measure: "count"})
	if err != nil || m.Name != "Coffee" || *m.MerchantID != cafe || m.CategoryID != nil || m.MatchText != nil || m.SortOrder != 10 {
		t.Fatalf("merchant create = %+v, %v", m, err)
	}
	c, err := f.st.Create(ctx, f.a, NewSavedTrend{Name: "Eating", MatchType: "category", CategoryID: &food, Measure: "amount"})
	if err != nil || c.SortOrder != 20 {
		t.Fatalf("category create = %+v, %v", c, err)
	}
	n, err := f.st.Create(ctx, f.a, NewSavedTrend{Name: "Lunches", MatchType: "note", MatchText: &txt, Measure: "amount"})
	if err != nil || *n.MatchText != "lunch" {
		t.Fatalf("note create = %+v, %v", n, err)
	}
	if _, err := f.st.Create(ctx, f.a, NewSavedTrend{Name: "coffee", MatchType: "note", MatchText: &txt, Measure: "amount"}); !errors.Is(err, ErrNameTaken) {
		t.Errorf("duplicate name = %v", err)
	}
	list, _ := f.st.List(ctx, f.a)
	if len(list) != 3 || list[0].ID != m.ID || list[2].ID != n.ID {
		t.Errorf("list = %+v", list)
	}

	// Update: rename, measure, sort order.
	nm, ms, so := "Coffee runs", "amount", 5
	u, err := f.st.Update(ctx, f.a, m.ID, SavedTrendPatch{Name: &nm, Measure: &ms, SortOrder: &so})
	if err != nil || u.Name != "Coffee runs" || u.Measure != "amount" || u.SortOrder != 5 {
		t.Fatalf("update = %+v, %v", u, err)
	}
	if _, err := f.st.Update(ctx, f.a, m.ID, SavedTrendPatch{Name: &[]string{"EATING"}[0]}); !errors.Is(err, ErrNameTaken) {
		t.Errorf("rename clash = %v", err)
	}
	// Changing type needs the new field; the old one is cleared.
	note := "tea"
	mt := "note"
	if _, err := f.st.Update(ctx, f.a, m.ID, SavedTrendPatch{MatchType: &mt}); err == nil {
		t.Error("type change without field accepted")
	}
	u, err = f.st.Update(ctx, f.a, m.ID, SavedTrendPatch{MatchType: &mt, SetText: true, MatchText: &note})
	if err != nil || u.MatchType != "note" || u.MerchantID != nil || *u.MatchText != "tea" {
		t.Errorf("type change = %+v, %v", u, err)
	}
	// Stray field for the current type, and clearing the required one.
	if _, err := f.st.Update(ctx, f.a, m.ID, SavedTrendPatch{SetCategory: true, CategoryID: &food}); err == nil {
		t.Error("extra field accepted")
	}
	if _, err := f.st.Update(ctx, f.a, m.ID, SavedTrendPatch{SetText: true}); err == nil {
		t.Error("cleared required field accepted")
	}
	if _, err := f.st.Update(ctx, f.a, m.ID, SavedTrendPatch{}); err == nil {
		t.Error("empty patch accepted")
	}

	// Bad input on create.
	for name, in := range map[string]NewSavedTrend{
		"missing field": {Name: "x", MatchType: "merchant", Measure: "amount"},
		"extra field":   {Name: "x", MatchType: "merchant", MerchantID: &cafe, CategoryID: &food, Measure: "amount"},
		"bad type":      {Name: "x", MatchType: "tag", Measure: "amount", MatchText: &txt},
		"bad measure":   {Name: "x", MatchType: "category", CategoryID: &food, Measure: "sum"},
		"empty name":    {Name: " ", MatchType: "category", CategoryID: &food, Measure: "amount"},
		"unknown cat":   {Name: "x", MatchType: "category", CategoryID: &[]int64{999999}[0], Measure: "amount"},
	} {
		var ve *ValidationError
		if _, err := f.st.Create(ctx, f.a, in); !errors.As(err, &ve) {
			t.Errorf("%s: err = %v", name, err)
		}
	}

	if err := f.st.Delete(ctx, f.a, m.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.st.Get(ctx, f.a, m.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("get deleted = %v", err)
	}
	if err := f.st.Delete(ctx, f.a, m.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("double delete = %v", err)
	}
}

func TestSavedTrendsTenancyAndCascade(t *testing.T) {
	f := newTrendFixture(t)
	ctx := context.Background()
	f.spend(f.a, "2026-01-05", 100, "Food", "Cafe", "")
	f.spend(f.b, "2026-01-05", 100, "Food", "Cafe", "")
	aCafe, bCafe := f.merchantID(f.a, "Cafe"), f.merchantID(f.b, "Cafe")
	aFood := f.byName(f.a, "Food").ID

	a, err := f.st.Create(ctx, f.a, NewSavedTrend{Name: "T", MatchType: "merchant", MerchantID: &aCafe, Measure: "amount"})
	if err != nil {
		t.Fatal(err)
	}
	// B cannot see, change or delete A's trend, nor reference A's merchant.
	if _, err := f.st.Get(ctx, f.b, a.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("get = %v", err)
	}
	nm := "x"
	if _, err := f.st.Update(ctx, f.b, a.ID, SavedTrendPatch{Name: &nm}); !errors.Is(err, ErrNotFound) {
		t.Errorf("update = %v", err)
	}
	if err := f.st.Delete(ctx, f.b, a.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("delete = %v", err)
	}
	var ve *ValidationError
	if _, err := f.st.Create(ctx, f.b, NewSavedTrend{Name: "T", MatchType: "merchant", MerchantID: &aCafe, Measure: "amount"}); !errors.As(err, &ve) {
		t.Errorf("foreign merchant = %v", err)
	}
	if _, err := f.st.Create(ctx, f.b, NewSavedTrend{Name: "T", MatchType: "category", CategoryID: &aFood, Measure: "amount"}); !errors.As(err, &ve) {
		t.Errorf("foreign category = %v", err)
	}
	// The same name is fine for another user.
	if _, err := f.st.Create(ctx, f.b, NewSavedTrend{Name: "T", MatchType: "merchant", MerchantID: &bCafe, Measure: "amount"}); err != nil {
		t.Errorf("same name other user = %v", err)
	}
	if l, _ := f.st.List(ctx, f.a); len(l) != 1 {
		t.Errorf("a's list = %+v", l)
	}

	// Deleting a matched category deletes the saved trend (DB cascade).
	if _, err := f.st.Create(ctx, f.a, NewSavedTrend{Name: "Cat", MatchType: "category", CategoryID: &aFood, Measure: "count"}); err != nil {
		t.Fatal(err)
	}
	if err := (Categories{DB: f.db}).Delete(ctx, f.a, aFood); err != nil {
		t.Fatal(err)
	}
	l, _ := f.st.List(ctx, f.a)
	if len(l) != 1 || l[0].Name != "T" {
		t.Errorf("after category delete = %+v", l)
	}
}

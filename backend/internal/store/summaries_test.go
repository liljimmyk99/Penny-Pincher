package store

import (
	"context"
	"testing"
)

type sumFixture struct {
	*monthFixture
	s Summaries
}

func (f *sumFixture) cat(c []CategoryMonth, id int64) CategoryMonth {
	for _, x := range c {
		if x.CategoryID == id {
			return x
		}
	}
	f.t.Fatalf("category %d missing", id)
	return CategoryMonth{}
}

func TestMonthlySummary(t *testing.T) {
	mf := newMonthFixture(t)
	f := &sumFixture{monthFixture: mf, s: Summaries{DB: mf.db}}
	ctx := context.Background()
	food, saving := f.byName(f.a, "Food"), f.byName(f.a, "Saving")

	f.income(f.a, "2026-03-05")
	f.income(f.a, "2026-03-20")
	orig := f.expense(f.a, "2026-02-10", 5000, nil)
	f.expense(f.a, "2026-03-02", 2000, nil)
	// Refund of a February purchase, logged in March: lowers March only.
	f.expense(f.a, "2026-03-09", -500, &orig.ID)
	f.exec(`INSERT INTO expenses (user_id, category_id, merchant_id, occurred_on, amount_cents, confirmed)
		VALUES (?, ?, (SELECT id FROM merchants WHERE user_id = ? LIMIT 1), '2026-03-11', 700, 0)`, f.a, saving.ID, f.a)
	// Another user's data never leaks in.
	f.expense(f.b, "2026-03-03", 99999, nil)
	f.income(f.b, "2026-03-03")

	got, err := f.s.Monthly(ctx, f.a, "2026-03")
	if err != nil {
		t.Fatal(err)
	}
	if got.Combined != (IncomeTotals{20000, 18000, 14000, 2}) {
		t.Errorf("combined = %+v", got.Combined)
	}
	if len(got.Sources) != 1 || got.Sources[0].Name != "Other" || got.Sources[0].EntryCount != 2 {
		t.Errorf("sources = %+v", got.Sources)
	}
	fc := f.cat(got.Categories, food.ID)
	if fc.TotalCents != 1500 || fc.ExpenseCount != 1 || fc.RefundCount != 1 || fc.PreviousTotalCents != 5000 {
		t.Errorf("food = %+v", fc)
	}
	sc := f.cat(got.Categories, saving.ID)
	if !sc.IsSaving || sc.TotalCents != 700 {
		t.Errorf("saving = %+v", sc)
	}
	if got.SpentCents != 2200 || got.SavingCents != 700 || got.PreviousMonthSpentCents != 5000 {
		t.Errorf("spent=%d saving=%d prev=%d", got.SpentCents, got.SavingCents, got.PreviousMonthSpentCents)
	}
	if got.LeftOverCents != 14000-2200 {
		t.Errorf("left over = %d", got.LeftOverCents)
	}
	if got.UnconfirmedExpenseCount != 1 || got.UnconfirmedIncomeEntryCount != 0 || got.IsEmpty {
		t.Errorf("unconfirmed/empty = %+v", got)
	}

	// February sees the original purchase in full; the later refund doesn't touch it.
	feb, _ := f.s.Monthly(ctx, f.a, "2026-02")
	if c := f.cat(feb.Categories, food.ID); c.TotalCents != 5000 {
		t.Errorf("feb food = %d", c.TotalCents)
	}

	empty, err := f.s.Monthly(ctx, f.a, "2026-06")
	if err != nil || !empty.IsEmpty || empty.SpentCents != 0 || len(empty.Categories) != len(got.Categories) {
		t.Errorf("empty = %+v, %v", empty, err)
	}
	if _, err := f.s.Monthly(ctx, f.a, "2026-13"); err == nil {
		t.Error("bad month accepted")
	}
}

func TestMonthlySummaryYearBoundary(t *testing.T) {
	mf := newMonthFixture(t)
	f := &sumFixture{monthFixture: mf, s: Summaries{DB: mf.db}}
	food := f.byName(f.a, "Food")
	f.expense(f.a, "2025-12-15", 4000, nil)
	f.expense(f.a, "2026-01-15", 1000, nil)

	jan, err := f.s.Monthly(context.Background(), f.a, "2026-01")
	if err != nil {
		t.Fatal(err)
	}
	if c := f.cat(jan.Categories, food.ID); c.TotalCents != 1000 || c.PreviousTotalCents != 4000 {
		t.Errorf("january food = %+v, want previous = December", c)
	}
	if jan.PreviousMonthSpentCents != 4000 {
		t.Errorf("previous spent = %d", jan.PreviousMonthSpentCents)
	}
}

func TestYearlySummary(t *testing.T) {
	mf := newMonthFixture(t)
	f := &sumFixture{monthFixture: mf, s: Summaries{DB: mf.db}}
	ctx := context.Background()
	food := f.byName(f.a, "Food")

	// Year in progress: only January, February and April have entries.
	f.income(f.a, "2026-01-05")
	f.expense(f.a, "2026-01-10", 1000, nil)
	orig := f.expense(f.a, "2026-02-10", 2000, nil)
	f.expense(f.a, "2026-04-02", -500, &orig.ID) // refund in a later month
	f.expense(f.a, "2025-12-31", 77777, nil)     // other year
	f.expense(f.b, "2026-01-10", 55555, nil)     // other user

	got, err := f.s.Yearly(ctx, f.a, 2026)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Months) != 12 || got.Months[0].Month != "2026-01" || got.Months[11].Month != "2026-12" {
		t.Fatalf("months = %+v", got.Months)
	}
	if got.AverageMonthCount != 3 {
		t.Errorf("average month count = %d, want 3", got.AverageMonthCount)
	}
	jan, mar, apr := got.Months[0], got.Months[2], got.Months[3]
	if !jan.HasEntries || jan.SpentCents != 1000 || jan.NetCents != 7000 || jan.LeftOverCents != 6000 {
		t.Errorf("jan = %+v", jan)
	}
	if mar.HasEntries || mar.SpentCents != 0 {
		t.Errorf("mar = %+v", mar)
	}
	if !apr.HasEntries || apr.SpentCents != -500 {
		t.Errorf("apr = %+v", apr)
	}
	if got.Totals.SpentCents != 2500 || got.Totals.NetCents != 7000 || got.Totals.LeftOverCents != 4500 {
		t.Errorf("totals = %+v", got.Totals)
	}
	for _, c := range got.Categories {
		if c.CategoryID == food.ID {
			// 2500 / 3 months = 833.33 -> 833
			if c.TotalCents != 2500 || c.MonthlyAverageCents != 833 {
				t.Errorf("food = %+v", c)
			}
		}
	}

	none, err := f.s.Yearly(ctx, f.a, 2030)
	if err != nil || none.AverageMonthCount != 0 {
		t.Fatalf("empty year = %+v, %v", none, err)
	}
	for _, c := range none.Categories {
		if c.MonthlyAverageCents != 0 {
			t.Errorf("average with no months = %+v", c)
		}
	}
	if _, err := f.s.Yearly(ctx, f.a, 1999); err == nil {
		t.Error("bad year accepted")
	}
}

func TestDivRound(t *testing.T) {
	for _, c := range []struct{ n, d, want int64 }{
		{2500, 3, 833}, {5, 2, 3}, {-5, 2, -3}, {-2500, 3, -833}, {7, 0, 0}, {4, 2, 2},
	} {
		if got := divRound(c.n, c.d); got != c.want {
			t.Errorf("divRound(%d,%d) = %d, want %d", c.n, c.d, got, c.want)
		}
	}
}

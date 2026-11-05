package store

import (
	"context"
	"testing"
)

func TestCategoryStats(t *testing.T) {
	f := newCatFixture(t)
	ctx := context.Background()
	food, housing := f.byName(f.a, "Food"), f.byName(f.a, "Housing")
	m := f.exec(`INSERT INTO merchants (user_id, name) VALUES (?, 'Shop')`, f.a)
	add := func(cat int64, date string, cents int64) {
		f.exec(`INSERT INTO expenses (user_id, category_id, merchant_id, occurred_on, amount_cents) VALUES (?, ?, ?, ?, ?)`, f.a, cat, m, date, cents)
	}
	add(food.ID, "2025-12-31", 1000)
	add(food.ID, "2026-01-01", 2000)
	add(food.ID, "2026-03-04", -500) // refund lowers the totals and still counts as an entry
	add(housing.ID, "2027-01-01", 9000)
	// Another user's expense never shows up.
	bm := f.exec(`INSERT INTO merchants (user_id, name) VALUES (?, 'Shop')`, f.b)
	f.exec(`INSERT INTO expenses (user_id, category_id, merchant_id, occurred_on, amount_cents) VALUES (?, ?, ?, '2026-01-01', 7777)`,
		f.b, f.byName(f.b, "Food").ID, bm)

	stats, err := f.c.Stats(ctx, f.a, 2026)
	if err != nil {
		t.Fatal(err)
	}
	cats, _ := f.c.List(ctx, f.a)
	if len(stats) != len(cats) {
		t.Fatalf("stats = %d rows, want one per category (%d)", len(stats), len(cats))
	}
	byID := map[int64]CategoryStat{}
	for i, s := range stats {
		if s.CategoryID != cats[i].ID {
			t.Fatalf("row %d is %d, want sort order (%d)", i, s.CategoryID, cats[i].ID)
		}
		byID[s.CategoryID] = s
	}
	if got := byID[food.ID]; got != (CategoryStat{food.ID, 3, 2500, 1500}) {
		t.Errorf("food = %+v", got)
	}
	if got := byID[housing.ID]; got != (CategoryStat{housing.ID, 1, 9000, 0}) {
		t.Errorf("housing = %+v", got)
	}
	if got := byID[f.byName(f.a, "Saving").ID]; got.EntryCount != 0 || got.TotalCents != 0 || got.YearTotalCents != 0 {
		t.Errorf("saving = %+v, want zero-filled", got)
	}

	for _, y := range []int{1999, 2101} {
		if _, err := f.c.Stats(ctx, f.a, y); err == nil {
			t.Errorf("year %d accepted", y)
		} else {
			wantValidation(t, err, "year")
		}
	}
}

func TestIncomeSourceStats(t *testing.T) {
	db := NewTestDB(t)
	ctx := context.Background()
	a, _ := AddUser(ctx, db, NewUser{FirebaseUID: "uid-a", Role: RoleMember})
	b, _ := AddUser(ctx, db, NewUser{FirebaseUID: "uid-b", Role: RoleMember})
	s := IncomeSources{DB: db}
	job, err := s.Create(ctx, a, "Job")
	if err != nil {
		t.Fatal(err)
	}
	entry := func(user, src int64, date string, gross, taxable, net int64) {
		t.Helper()
		if _, err := db.Exec(`INSERT INTO income_entries (user_id, income_source_id, received_on, gross_cents, gross_taxable_cents, net_cents) VALUES (?, ?, ?, ?, ?, ?)`,
			user, src, date, gross, taxable, net); err != nil {
			t.Fatal(err)
		}
	}
	entry(a, job.ID, "2025-12-31", 100000, 90000, 70000)
	entry(a, job.ID, "2026-01-15", 200000, 180000, 140000)
	entry(a, job.ID, "2026-12-31", 100000, 100000, 80000)
	bSrcs, _ := s.List(ctx, b)
	entry(b, bSrcs[0].ID, "2026-01-01", 5, 5, 5)

	stats, err := s.Stats(ctx, a, 2026)
	if err != nil {
		t.Fatal(err)
	}
	if len(stats) != 2 {
		t.Fatalf("stats = %+v, want Job and Other", stats)
	}
	if stats[0] != (IncomeSourceStat{job.ID, 3, 300000, 280000, 220000}) {
		t.Errorf("job = %+v", stats[0])
	}
	if stats[1].EntryCount != 0 || stats[1].YearGrossCents != 0 || stats[1].YearNetCents != 0 {
		t.Errorf("other = %+v, want zero-filled", stats[1])
	}
	if _, err := s.Stats(ctx, a, 1999); err == nil {
		t.Fatal("year 1999 accepted")
	} else {
		wantValidation(t, err, "year")
	}
}

package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"testing/fstest"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/migrations"
)

type importFixture struct{ *monthFixture }

func newImportFixture(t *testing.T) *importFixture {
	t.Helper()
	return &importFixture{newMonthFixture(t)}
}

func (f *importFixture) imports() Imports { return Imports{DB: f.db} }

func sp(s string) *string { return &s }
func ip(n int64) *int64   { return &n }

func sampleImport() NewImport {
	return NewImport{
		FileName: "old.xlsx",
		Rows: []ImportRow{
			{Sheet: SheetExpenses, RowNumber: 2, Ready: true, Date: sp("2019-03-05"), Category: sp("Food"), Merchant: sp("Shop"), Amount: ip(1250)},
			{Sheet: SheetExpenses, RowNumber: 3, Ready: false, Original: sp(`["2019-03-06","Nope","Shop","5.00",""]`)},
			{Sheet: SheetIncome, RowNumber: 2, Ready: true, Date: sp("2020-01-31"), Source: sp("Other"), Gross: ip(100), Taxable: ip(90), Net: ip(70)},
		},
		Issues: []ImportIssue{
			{Sheet: SheetExpenses, RowNumber: 3, Column: "Category", Code: "unknown_category", Value: "Nope", Message: "Unknown category"},
			{Sheet: SheetExpenses, RowNumber: 3, Column: "Amount", Code: "too_many_decimals", Value: "5.001", Message: "Too many decimals"},
		},
	}
}

func (f *importFixture) create(user int64) Import {
	f.t.Helper()
	imp, err := f.imports().Create(context.Background(), user, sampleImport())
	if err != nil {
		f.t.Fatal(err)
	}
	return imp
}

func TestImportCreateAndGet(t *testing.T) {
	f := newImportFixture(t)
	ctx := context.Background()
	imp := f.create(f.a)
	if imp.Status != ImportReview || imp.ExpenseRows != 2 || imp.IncomeRows != 1 ||
		imp.RowsReady != 2 || imp.RowsWithProblems != 1 || imp.EntriesImported != 0 {
		t.Fatalf("import = %+v", imp)
	}
	if imp.FirstMonth == nil || *imp.FirstMonth != "2019-03" || *imp.LastMonth != "2020-01" {
		t.Fatalf("months = %v %v", imp.FirstMonth, imp.LastMonth)
	}
	got, err := f.imports().Get(ctx, f.a, imp.ID)
	if err != nil || got.ID != imp.ID {
		t.Fatalf("Get = %+v, %v", got, err)
	}
	issues, more, err := f.imports().Issues(ctx, f.a, imp.ID, 1)
	if err != nil || len(issues) != 1 || !more || issues[0].Code != "unknown_category" {
		t.Fatalf("issues = %+v more=%v %v", issues, more, err)
	}
	if issues, more, _ = f.imports().Issues(ctx, f.a, imp.ID, 0); len(issues) != 2 || more {
		t.Fatalf("all issues = %+v more=%v", issues, more)
	}
	ready, err := f.imports().Rows(ctx, f.a, imp.ID, true)
	if err != nil || len(ready) != 2 || *ready[0].Date != "2019-03-05" || *ready[0].Amount != 1250 {
		t.Fatalf("ready = %+v %v", ready, err)
	}
	bad, err := f.imports().Rows(ctx, f.a, imp.ID, false)
	if err != nil || len(bad) != 1 || bad[0].RowNumber != 3 || bad[0].Original == nil {
		t.Fatalf("bad = %+v %v", bad, err)
	}
}

func TestImportCreateValidation(t *testing.T) {
	f := newImportFixture(t)
	ctx := context.Background()
	in := sampleImport()
	in.Issues[0].RowNumber = 99
	var ve *ValidationError
	if _, err := f.imports().Create(ctx, f.a, in); !errors.As(err, &ve) {
		t.Fatalf("issue on unchecked row: %v", err)
	}
	in = sampleImport()
	in.Rows[1].RowNumber = 2
	if _, err := f.imports().Create(ctx, f.a, in); !errors.As(err, &ve) {
		t.Fatalf("repeated row: %v", err)
	}
	in = sampleImport()
	in.Rows[0].Category = nil // a ready expense row needs its values
	if _, err := f.imports().Create(ctx, f.a, in); err == nil {
		t.Fatal("ready row without category accepted")
	}
	if l, _ := f.imports().List(ctx, f.a, ImportFilter{}); len(l) != 0 {
		t.Fatalf("failed creates left %d imports", len(l))
	}
}

func TestImportTenancy(t *testing.T) {
	f := newImportFixture(t)
	ctx := context.Background()
	imp := f.create(f.a)
	im := f.imports()

	if _, err := im.Get(ctx, f.b, imp.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("Get: %v", err)
	}
	if l, err := im.List(ctx, f.b, ImportFilter{}); err != nil || len(l) != 0 {
		t.Errorf("List = %v %v", l, err)
	}
	if _, _, err := im.Issues(ctx, f.b, imp.ID, 0); !errors.Is(err, ErrNotFound) {
		t.Errorf("Issues: %v", err)
	}
	if _, err := im.Rows(ctx, f.b, imp.ID, true); !errors.Is(err, ErrNotFound) {
		t.Errorf("Rows: %v", err)
	}
	if err := im.Discard(ctx, f.b, imp.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("Discard: %v", err)
	}
	if _, err := im.DeleteEntries(ctx, f.b, imp.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("DeleteEntries: %v", err)
	}
	if n, err := im.ExpireStale(ctx, f.b, time.Now().Add(48*time.Hour)); err != nil || n != 0 {
		t.Errorf("ExpireStale as B = %d %v", n, err)
	}
	if got, err := im.Get(ctx, f.a, imp.ID); err != nil || got.Status != ImportReview {
		t.Errorf("A's import was touched: %+v %v", got, err)
	}

	// The database refuses an entry that points at another user's import.
	exp := f.expense(f.b, "2020-01-01", 100, nil)
	if _, err := f.db.Exec(`UPDATE expenses SET import_id = ? WHERE id = ?`, imp.ID, exp.ID); err == nil {
		t.Error("expense with another user's import_id accepted")
	}
	inc := f.income(f.b, "2020-01-01")
	if _, err := f.db.Exec(`UPDATE income_entries SET import_id = ? WHERE id = ?`, imp.ID, inc.ID); err == nil {
		t.Error("income entry with another user's import_id accepted")
	}
	if _, err := f.db.Exec(`INSERT INTO expenses (user_id, category_id, merchant_id, occurred_on, amount_cents, import_id)
		VALUES (?, ?, ?, '2020-01-01', 100, ?)`, f.b, f.byName(f.b, "Food").ID, exp.Merchant.ID, imp.ID); err == nil {
		t.Error("inserted expense with another user's import_id")
	}
}

func TestImportListFilter(t *testing.T) {
	f := newImportFixture(t)
	ctx := context.Background()
	a1, a2 := f.create(f.a), f.create(f.a)
	f.create(f.b)
	if _, err := f.db.Exec(`UPDATE imports SET status = 'running' WHERE id = ?`, a1.ID); err != nil {
		t.Fatal(err)
	}
	l, err := f.imports().List(ctx, f.a, ImportFilter{})
	if err != nil || len(l) != 2 || l[0].ID != a2.ID {
		t.Fatalf("list = %+v %v", l, err)
	}
	if l, _ = f.imports().List(ctx, f.a, ImportFilter{Status: ImportRunning}); len(l) != 1 || l[0].ID != a1.ID {
		t.Fatalf("running = %+v", l)
	}
	var ve *ValidationError
	if _, err = f.imports().List(ctx, f.a, ImportFilter{Status: "bogus"}); !errors.As(err, &ve) {
		t.Fatalf("bogus status: %v", err)
	}
	// Only one running import per user.
	if _, err := f.db.Exec(`UPDATE imports SET status = 'running' WHERE id = ?`, a2.ID); err == nil {
		t.Fatal("two running imports for one user accepted")
	}
}

func TestImportDiscard(t *testing.T) {
	f := newImportFixture(t)
	ctx := context.Background()
	imp := f.create(f.a)
	if err := f.imports().Discard(ctx, f.a, imp.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.imports().Get(ctx, f.a, imp.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("after discard: %v", err)
	}
	var n int
	f.db.QueryRow(`SELECT (SELECT count(*) FROM import_rows) + (SELECT count(*) FROM import_issues)`).Scan(&n)
	if n != 0 {
		t.Fatalf("%d rows/issues left", n)
	}
	imp = f.create(f.a)
	f.db.Exec(`UPDATE imports SET status = 'completed' WHERE id = ?`, imp.ID)
	if err := f.imports().Discard(ctx, f.a, imp.ID); !errors.Is(err, ErrImportNotInReview) {
		t.Fatalf("discard completed: %v", err)
	}
}

func TestImportExpire(t *testing.T) {
	f := newImportFixture(t)
	ctx := context.Background()
	oldA, newA, oldB := f.create(f.a), f.create(f.a), f.create(f.b)
	back := time.Now().Add(-25 * time.Hour).UTC().Format("2006-01-02T15:04:05.000Z")
	f.db.Exec(`UPDATE imports SET created_at = ? WHERE id IN (?, ?)`, back, oldA.ID, oldB.ID)

	n, err := f.imports().ExpireStale(ctx, f.a, time.Now())
	if err != nil || n != 1 {
		t.Fatalf("expired = %d %v", n, err)
	}
	got, _ := f.imports().Get(ctx, f.a, oldA.ID)
	if got.Status != ImportExpired || got.FinishedAt == nil {
		t.Fatalf("old = %+v", got)
	}
	if got, _ = f.imports().Get(ctx, f.a, newA.ID); got.Status != ImportReview {
		t.Fatalf("new = %+v", got)
	}
	if got, _ = f.imports().Get(ctx, f.b, oldB.ID); got.Status != ImportReview {
		t.Fatalf("B's was expired by A's call: %+v", got)
	}
	var rows int
	f.db.QueryRow(`SELECT count(*) FROM import_rows WHERE import_id = ?`, oldA.ID).Scan(&rows)
	if rows != 0 {
		t.Fatalf("expired import kept %d rows", rows)
	}
	if n, err = f.imports().ExpireAllStale(ctx, time.Now()); err != nil || n != 1 {
		t.Fatalf("all = %d %v", n, err)
	}
	// Running imports never expire.
	f.db.Exec(`UPDATE imports SET status = 'running', created_at = ? WHERE id = ?`, back, newA.ID)
	if n, _ = f.imports().ExpireAllStale(ctx, time.Now()); n != 0 {
		t.Fatalf("running import expired")
	}
}

func TestImportDeleteEntries(t *testing.T) {
	f := newImportFixture(t)
	ctx := context.Background()
	imp, other := f.create(f.a), f.create(f.a)
	orig := f.expense(f.a, "2020-01-10", 5000, nil)
	byHand := f.expense(f.a, "2020-01-11", 700, nil)
	refund := f.expense(f.a, "2020-02-01", -300, &orig.ID) // hand-made, links to an imported expense
	inc := f.income(f.a, "2020-01-31")
	otherEntry := f.expense(f.a, "2020-01-12", 100, nil)
	bExp := f.expense(f.b, "2020-01-10", 900, nil)
	bInc := f.income(f.b, "2020-01-31")
	f.db.Exec(`UPDATE expenses SET import_id = ? WHERE id = ?`, imp.ID, orig.ID)
	f.db.Exec(`UPDATE income_entries SET import_id = ? WHERE id = ?`, imp.ID, inc.ID)
	f.db.Exec(`UPDATE expenses SET import_id = ? WHERE id = ?`, other.ID, otherEntry.ID)

	got, _ := f.x.Get(ctx, f.a, orig.ID)
	if got.ImportID == nil || *got.ImportID != imp.ID {
		t.Fatalf("Expense.ImportID = %v", got.ImportID)
	}
	if e, _ := f.inc.Get(ctx, f.a, inc.ID); e.ImportID == nil || *e.ImportID != imp.ID {
		t.Fatalf("IncomeEntry.ImportID = %v", e.ImportID)
	}
	if byHand.ImportID != nil {
		t.Fatal("hand-made entry has import_id")
	}
	if g, _ := f.imports().Get(ctx, f.a, imp.ID); g.EntriesImported != 2 {
		t.Fatalf("entries imported = %d", g.EntriesImported)
	}

	n, err := f.imports().DeleteEntries(ctx, f.a, imp.ID)
	if err != nil || n != 2 {
		t.Fatalf("deleted = %d %v", n, err)
	}
	if _, err := f.x.Get(ctx, f.a, orig.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("imported expense survived: %v", err)
	}
	if _, err := f.inc.Get(ctx, f.a, inc.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("imported income survived: %v", err)
	}
	r, err := f.x.Get(ctx, f.a, refund.ID)
	if err != nil || r.RefundedExpenseID != nil {
		t.Errorf("refund = %+v %v, want kept and unlinked", r, err)
	}
	for _, id := range []int64{byHand.ID, otherEntry.ID} {
		if _, err := f.x.Get(ctx, f.a, id); err != nil {
			t.Errorf("unrelated expense %d lost: %v", id, err)
		}
	}
	if _, err := f.x.Get(ctx, f.b, bExp.ID); err != nil {
		t.Errorf("B's expense lost: %v", err)
	}
	if _, err := f.inc.Get(ctx, f.b, bInc.ID); err != nil {
		t.Errorf("B's income lost: %v", err)
	}
}

// The migration runs on a database that already has 0001 applied and holds data.
func TestMigrate0002OnExistingSchema(t *testing.T) {
	ctx := context.Background()
	db, err := Open(filepath.Join(t.TempDir(), "old.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	first, err := migrations.FS.ReadFile("0001_init.sql")
	if err != nil {
		t.Fatal(err)
	}
	if err := migrate(ctx, db, fstest.MapFS{"0001_init.sql": {Data: first}}); err != nil {
		t.Fatal(err)
	}
	uid, err := AddUser(ctx, db, NewUser{FirebaseUID: "uid-old", Role: RoleMember})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO income_entries (user_id, income_source_id, received_on, gross_cents, gross_taxable_cents, net_cents)
		VALUES (?, (SELECT id FROM income_sources WHERE user_id = ?), '2020-01-01', 5, 5, 5)`, uid, uid); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	e, _, err := IncomeEntries{DB: db}.List(ctx, uid, IncomeEntryFilter{}, Page{})
	if err != nil || len(e) != 1 || e[0].ImportID != nil {
		t.Fatalf("entries after migrate = %+v %v", e, err)
	}
}

package store

import (
	"context"
	"errors"
	"testing"
)

func (f *importFixture) resolved(user int64) []ResolvedImportRow {
	return []ResolvedImportRow{
		{Sheet: SheetExpenses, Date: "2019-03-05", CategoryID: f.byName(user, "Food").ID, Merchant: "Corner Shop", Amount: 1250},
		{Sheet: SheetExpenses, Date: "2019-03-06", CategoryID: f.byName(user, "Food").ID, Merchant: "corner shop", Amount: -250},
		{Sheet: SheetIncome, Date: "2020-01-31", SourceID: f.src(user, "Other").ID, Gross: 100, Taxable: 90, Net: 70},
	}
}

func TestImportStartAndWrongStatus(t *testing.T) {
	f := newImportFixture(t)
	ctx := context.Background()
	imp, second := f.create(f.a), f.create(f.a)

	got, err := f.imports().Start(ctx, f.a, imp.ID)
	if err != nil || got.Status != ImportRunning {
		t.Fatalf("Start = %+v, %v", got, err)
	}
	if _, err := f.imports().Start(ctx, f.a, second.ID); !errors.Is(err, ErrImportInProgress) {
		t.Fatalf("second start = %v, want ErrImportInProgress", err)
	}
	if _, err := f.imports().Start(ctx, f.a, imp.ID); !errors.Is(err, ErrImportWrongStatus) {
		t.Fatalf("restart = %v, want ErrImportWrongStatus", err)
	}
	// Another user can run an import at the same time.
	if _, err := f.imports().Start(ctx, f.b, f.create(f.b).ID); err != nil {
		t.Fatalf("other user's start = %v", err)
	}
}

func TestImportWriteBatchTagsConfirmsAndMatchesMerchants(t *testing.T) {
	f := newImportFixture(t)
	ctx := context.Background()
	imp := f.create(f.a)
	if err := f.imports().WriteBatch(ctx, f.a, imp.ID, f.resolved(f.a)); !errors.Is(err, ErrImportWrongStatus) {
		t.Fatalf("batch before start = %v, want ErrImportWrongStatus", err)
	}
	if _, err := f.imports().Start(ctx, f.a, imp.ID); err != nil {
		t.Fatal(err)
	}
	if err := f.imports().WriteBatch(ctx, f.a, imp.ID, f.resolved(f.a)); err != nil {
		t.Fatal(err)
	}
	var n, confirmed, merchants int
	f.db.QueryRow(`SELECT count(*), sum(confirmed) FROM expenses WHERE user_id = ? AND import_id = ?`, f.a, imp.ID).Scan(&n, &confirmed)
	if n != 2 || confirmed != 2 {
		t.Fatalf("expenses = %d confirmed = %d", n, confirmed)
	}
	f.db.QueryRow(`SELECT count(*) FROM merchants WHERE user_id = ? AND name = 'Corner Shop'`, f.a).Scan(&merchants)
	if merchants != 1 {
		t.Fatalf("merchants = %d, want 1 (case-insensitive match)", merchants)
	}
	f.db.QueryRow(`SELECT count(*), sum(confirmed) FROM income_entries WHERE user_id = ? AND import_id = ?`, f.a, imp.ID).Scan(&n, &confirmed)
	if n != 1 || confirmed != 1 {
		t.Fatalf("income = %d confirmed = %d", n, confirmed)
	}
	if g, _ := f.imports().Get(ctx, f.a, imp.ID); g.RowsDone != 3 || g.EntriesImported != 3 {
		t.Fatalf("import = %+v", g)
	}
}

func TestImportCompleteThenUndo(t *testing.T) {
	f := newImportFixture(t)
	ctx := context.Background()
	imp := f.create(f.a)
	f.imports().Start(ctx, f.a, imp.ID)
	if err := f.imports().WriteBatch(ctx, f.a, imp.ID, f.resolved(f.a)); err != nil {
		t.Fatal(err)
	}
	// Undo is only for a completed import.
	if _, err := f.imports().Rollback(ctx, f.a, imp.ID, ImportCompleted, ImportUndone, nil); !errors.Is(err, ErrImportWrongStatus) {
		t.Fatalf("undo while running = %v", err)
	}
	if got, err := f.imports().Complete(ctx, f.a, imp.ID); err != nil || got.Status != ImportCompleted || got.FinishedAt == nil {
		t.Fatalf("Complete = %+v, %v", got, err)
	}

	// An imported expense is edited, a refund (by hand) is linked to another, and a
	// hand-made entry sits in the same month.
	var edited, linked int64
	f.db.QueryRow(`SELECT id FROM expenses WHERE import_id = ? AND amount_cents = 1250`, imp.ID).Scan(&edited)
	linked = edited
	note := "edited"
	if _, err := f.x.Update(ctx, f.a, edited, ExpensePatch{SetNote: true, Note: &note}); err != nil {
		t.Fatal(err)
	}
	refund := f.expense(f.a, "2019-04-02", -100, &linked)
	byHand := f.expense(f.a, "2019-03-20", 700, nil)

	got, err := f.imports().Rollback(ctx, f.a, imp.ID, ImportCompleted, ImportUndone, nil)
	if err != nil || got.Status != ImportUndone || got.EntriesImported != 0 || got.FailureReason != nil {
		t.Fatalf("undo = %+v, %v", got, err)
	}
	if _, err := f.x.Get(ctx, f.a, edited); !errors.Is(err, ErrNotFound) {
		t.Fatalf("edited imported expense survived: %v", err)
	}
	if r, err := f.x.Get(ctx, f.a, refund.ID); err != nil || r.RefundedExpenseID != nil {
		t.Fatalf("refund = %+v, %v; want kept and unlinked", r, err)
	}
	if _, err := f.x.Get(ctx, f.a, byHand.ID); err != nil {
		t.Fatalf("hand-made entry was deleted: %v", err)
	}
	if _, err := f.imports().Rollback(ctx, f.a, imp.ID, ImportCompleted, ImportUndone, nil); !errors.Is(err, ErrImportWrongStatus) {
		t.Fatalf("second undo = %v", err)
	}
}

func TestImportRollbackFailedKeepsReasonOnlyForFailed(t *testing.T) {
	f := newImportFixture(t)
	ctx := context.Background()
	imp := f.create(f.a)
	f.imports().Start(ctx, f.a, imp.ID)
	f.imports().WriteBatch(ctx, f.a, imp.ID, f.resolved(f.a))
	reason := "safe reason"
	got, err := f.imports().Rollback(ctx, f.a, imp.ID, ImportRunning, ImportFailed, &reason)
	if err != nil || got.Status != ImportFailed || got.FailureReason == nil || *got.FailureReason != reason ||
		got.EntriesImported != 0 || got.RowsDone != 0 {
		t.Fatalf("failed = %+v, %v", got, err)
	}

	imp2 := f.create(f.a)
	f.imports().Start(ctx, f.a, imp2.ID)
	got, err = f.imports().Rollback(ctx, f.a, imp2.ID, ImportRunning, ImportCancelled, &reason)
	if err != nil || got.Status != ImportCancelled || got.FailureReason != nil {
		t.Fatalf("cancelled = %+v, %v", got, err)
	}
}

func TestImportRecoverRunning(t *testing.T) {
	f := newImportFixture(t)
	ctx := context.Background()
	a, b, review := f.create(f.a), f.create(f.b), f.create(f.a)
	for _, p := range []struct {
		u int64
		i Import
	}{{f.a, a}, {f.b, b}} {
		f.imports().Start(ctx, p.u, p.i.ID)
		f.imports().WriteBatch(ctx, p.u, p.i.ID, f.resolved(p.u))
	}
	kept := f.expense(f.a, "2019-03-20", 700, nil)

	n, err := f.imports().RecoverRunning(ctx)
	if err != nil || n != 2 {
		t.Fatalf("RecoverRunning = %d, %v", n, err)
	}
	for _, p := range []struct {
		u int64
		i Import
	}{{f.a, a}, {f.b, b}} {
		g, _ := f.imports().Get(ctx, p.u, p.i.ID)
		if g.Status != ImportFailed || g.FailureReason == nil || *g.FailureReason != RestartFailureReason || g.EntriesImported != 0 {
			t.Fatalf("recovered = %+v", g)
		}
	}
	if g, _ := f.imports().Get(ctx, f.a, review.ID); g.Status != ImportReview {
		t.Fatalf("review import changed to %s", g.Status)
	}
	if _, err := f.x.Get(ctx, f.a, kept.ID); err != nil {
		t.Fatalf("hand-made entry deleted: %v", err)
	}
	if n, _ := f.imports().RecoverRunning(ctx); n != 0 {
		t.Fatalf("second recovery = %d", n)
	}
}

func TestImportRunTenancy(t *testing.T) {
	f := newImportFixture(t)
	ctx := context.Background()
	imp := f.create(f.a)
	if _, err := f.imports().Start(ctx, f.b, imp.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Start as B = %v", err)
	}
	f.imports().Start(ctx, f.a, imp.ID)
	if err := f.imports().WriteBatch(ctx, f.b, imp.ID, nil); !errors.Is(err, ErrImportWrongStatus) {
		t.Fatalf("WriteBatch as B = %v", err)
	}
	if _, err := f.imports().Complete(ctx, f.b, imp.ID); !errors.Is(err, ErrImportWrongStatus) {
		t.Fatalf("Complete as B = %v", err)
	}
	if _, err := f.imports().Rollback(ctx, f.b, imp.ID, ImportRunning, ImportCancelled, nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Rollback as B = %v", err)
	}
	if g, _ := f.imports().Get(ctx, f.a, imp.ID); g.Status != ImportRunning {
		t.Fatalf("A's import = %s", g.Status)
	}
}

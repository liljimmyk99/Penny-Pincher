package store

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// srcFixture is a database with two seeded users, A and B.
type srcFixture struct {
	*catFixture
	s IncomeSources
}

func newSrcFixture(t *testing.T) *srcFixture {
	t.Helper()
	cf := newCatFixture(t)
	return &srcFixture{catFixture: cf, s: IncomeSources{DB: cf.db}}
}

func (f *srcFixture) src(user int64, name string) IncomeSource {
	f.t.Helper()
	srcs, err := f.s.List(context.Background(), user)
	if err != nil {
		f.t.Fatal(err)
	}
	for _, s := range srcs {
		if s.Name == name {
			return s
		}
	}
	f.t.Fatalf("user %d has no income source %q", user, name)
	return IncomeSource{}
}

func (f *srcFixture) srcNames(user int64) string {
	f.t.Helper()
	srcs, err := f.s.List(context.Background(), user)
	if err != nil {
		f.t.Fatal(err)
	}
	var n []string
	for _, s := range srcs {
		n = append(n, s.Name)
	}
	return strings.Join(n, ",")
}

func (f *srcFixture) create(user int64, name string) IncomeSource {
	f.t.Helper()
	s, err := f.s.Create(context.Background(), user, name)
	if err != nil {
		f.t.Fatal(err)
	}
	return s
}

func (f *srcFixture) addEntry(user, source int64) int64 {
	f.t.Helper()
	return f.exec(`INSERT INTO income_entries (user_id, income_source_id, received_on, gross_cents, gross_taxable_cents, net_cents)
		VALUES (?, ?, '2026-01-15', 10000, 9000, 7000)`, user, source)
}

func (f *srcFixture) addTemplateItem(user, source int64) int64 {
	f.t.Helper()
	tmpl := f.count(`SELECT id FROM templates WHERE user_id = ?`, user)
	return f.exec(`INSERT INTO template_income_items (template_id, user_id, income_source_id, day_of_month, gross_cents, gross_taxable_cents, net_cents)
		VALUES (?, ?, ?, 15, 10000, 9000, 7000)`, tmpl, user, source)
}

func TestListIncomeSourcesSeededAndScoped(t *testing.T) {
	f := newSrcFixture(t)
	ctx := context.Background()
	f.create(f.b, "Job")

	srcs, err := f.s.List(ctx, f.a)
	if err != nil {
		t.Fatal(err)
	}
	if len(srcs) != 1 || srcs[0].Name != "Other" || !srcs[0].IsProtected || srcs[0].HasEntries {
		t.Fatalf("user A = %+v", srcs)
	}
	if srcs[0].CreatedAt.IsZero() || srcs[0].UpdatedAt.IsZero() {
		t.Fatalf("timestamps not parsed: %+v", srcs[0])
	}
	if got := f.srcNames(f.b); got != "Job,Other" {
		t.Fatalf("user B = %s", got)
	}
	none, err := f.s.List(ctx, 9999)
	if err != nil || len(none) != 0 {
		t.Fatalf("unknown user = %v, %v", none, err)
	}
}

func TestIncomeSourceHasEntries(t *testing.T) {
	f := newSrcFixture(t)
	job := f.create(f.a, "Job")
	if job.HasEntries {
		t.Fatal("new source has entries")
	}
	f.addTemplateItem(f.a, job.ID) // template items are not entries
	if f.src(f.a, "Job").HasEntries {
		t.Fatal("template item counted as an entry")
	}
	f.addEntry(f.a, job.ID)
	if !f.src(f.a, "Job").HasEntries || f.src(f.a, "Other").HasEntries {
		t.Fatalf("has_entries: job=%v other=%v", f.src(f.a, "Job").HasEntries, f.src(f.a, "Other").HasEntries)
	}
}

func TestCreateIncomeSource(t *testing.T) {
	f := newSrcFixture(t)
	ctx := context.Background()

	src := f.create(f.a, "  Main job  ")
	if src.Name != "Main job" || src.IsProtected || src.HasEntries || src.SortOrder != 10 {
		t.Fatalf("created = %+v", src)
	}
	f.create(f.a, "Side gig")
	if got := f.srcNames(f.a); got != "Main job,Side gig,Other" {
		t.Fatalf("order = %s", got)
	}

	// Names are unique per user, case-insensitively, but not across users.
	if _, err := f.s.Create(ctx, f.a, "MAIN JOB"); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("duplicate = %v", err)
	}
	if _, err := f.s.Create(ctx, f.a, "other"); !errors.Is(err, ErrNameTaken) {
		t.Fatalf("duplicate of Other = %v", err)
	}
	if _, err := f.s.Create(ctx, f.b, "Main job"); err != nil {
		t.Fatalf("same name for another user = %v", err)
	}

	_, err := f.s.Create(ctx, f.a, "   ")
	wantValidation(t, err, "name")
	_, err = f.s.Create(ctx, f.a, strings.Repeat("é", 101))
	wantValidation(t, err, "name")
	if _, err := f.s.Create(ctx, f.a, strings.Repeat("é", 100)); err != nil {
		t.Fatalf("100 characters = %v", err)
	}
}

func TestCreateIncomeSourceWhenOtherIsNotLast(t *testing.T) {
	f := newSrcFixture(t)
	ctx := context.Background()
	job := f.create(f.a, "Job")
	if _, err := f.s.Reorder(ctx, f.a, []int64{f.src(f.a, "Other").ID, job.ID}); err != nil {
		t.Fatal(err)
	}
	f.create(f.a, "Gig")
	if got := f.srcNames(f.a); got != "Other,Job,Gig" {
		t.Fatalf("order = %s", got)
	}
}

func TestRenameIncomeSource(t *testing.T) {
	f := newSrcFixture(t)
	ctx := context.Background()
	job := f.create(f.a, "Job")
	f.create(f.a, "Gig")

	src, err := f.s.Rename(ctx, f.a, job.ID, " Day job ")
	if err != nil {
		t.Fatal(err)
	}
	if src.Name != "Day job" || src.ID != job.ID || src.SortOrder != job.SortOrder {
		t.Fatalf("renamed = %+v", src)
	}
	if src.UpdatedAt.Before(job.UpdatedAt) || !src.CreatedAt.Equal(job.CreatedAt) {
		t.Fatal("timestamps wrong after rename")
	}

	// A source with entries can still be renamed, and keeps its entries.
	entry := f.addEntry(f.a, job.ID)
	if src, err = f.s.Rename(ctx, f.a, job.ID, "Employer"); err != nil || src.Name != "Employer" || !src.HasEntries {
		t.Fatalf("rename with entries = %+v, %v", src, err)
	}
	if n := f.count(`SELECT count(*) FROM income_entries WHERE id = ? AND income_source_id = ?`, entry, job.ID); n != 1 {
		t.Fatal("entry lost its source")
	}

	// Changing only the case of its own name is allowed; taking another's is not.
	if src, err = f.s.Rename(ctx, f.a, job.ID, "EMPLOYER"); err != nil || src.Name != "EMPLOYER" {
		t.Fatalf("case change = %+v, %v", src, err)
	}
	for _, taken := range []string{"gig", "OTHER"} {
		if _, err := f.s.Rename(ctx, f.a, job.ID, taken); !errors.Is(err, ErrNameTaken) {
			t.Fatalf("rename to %q = %v", taken, err)
		}
	}

	_, err = f.s.Rename(ctx, f.a, job.ID, " ")
	wantValidation(t, err, "name")
	if _, err := f.s.Rename(ctx, f.a, 9999, "X"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing = %v", err)
	}
}

func TestOtherIncomeSourceIsProtected(t *testing.T) {
	f := newSrcFixture(t)
	ctx := context.Background()
	other := f.src(f.a, "Other")

	for _, name := range []string{"Misc", "Other", "OTHER"} {
		if _, err := f.s.Rename(ctx, f.a, other.ID, name); !errors.Is(err, ErrProtected) {
			t.Errorf("rename to %q = %v, want ErrProtected", name, err)
		}
	}
	if err := f.s.Delete(ctx, f.a, other.ID); !errors.Is(err, ErrProtected) {
		t.Fatalf("delete = %v", err)
	}
	// Protected wins over has-entries.
	f.addEntry(f.a, other.ID)
	if err := f.s.Delete(ctx, f.a, other.ID); !errors.Is(err, ErrProtected) {
		t.Fatalf("delete with entries = %v", err)
	}
	if got := f.src(f.a, "Other"); got.ID != other.ID || got.Name != "Other" {
		t.Fatalf("Other = %+v", got)
	}
}

func TestIncomeSourceTriggersAreTheSafetyNet(t *testing.T) {
	f := newSrcFixture(t)
	other := f.src(f.a, "Other")
	for _, q := range []string{
		`UPDATE income_sources SET name = 'Misc' WHERE id = ?`,
		`DELETE FROM income_sources WHERE id = ?`,
	} {
		if _, err := f.db.Exec(q, other.ID); !errors.Is(mapConstraint(err), ErrProtected) {
			t.Errorf("%s: err = %v", q, err)
		}
	}
	job := f.create(f.a, "Job")
	if _, err := f.db.Exec(`UPDATE income_sources SET is_protected = 1 WHERE id = ?`, job.ID); !errors.Is(mapConstraint(err), ErrProtected) {
		t.Errorf("promote: err = %v", err)
	}
	if _, err := f.db.Exec(`UPDATE income_sources SET name = 'Other' WHERE id = ?`, job.ID); !errors.Is(mapConstraint(err), ErrNameTaken) {
		t.Errorf("unique: err = %v", err)
	}
	f.addEntry(f.a, job.ID)
	if _, err := f.db.Exec(`DELETE FROM income_sources WHERE id = ?`, job.ID); !errors.Is(mapConstraint(err), ErrSourceHasEntries) {
		t.Errorf("delete with entries: err = %v", err)
	}
}

func TestReorderIncomeSources(t *testing.T) {
	f := newSrcFixture(t)
	ctx := context.Background()
	job, gig := f.create(f.a, "Job"), f.create(f.a, "Gig")
	other := f.src(f.a, "Other")
	f.create(f.b, "Job")

	ids := []int64{other.ID, gig.ID, job.ID}
	out, err := f.s.Reorder(ctx, f.a, ids)
	if err != nil {
		t.Fatal(err)
	}
	const want = "Other,Gig,Job"
	if got := f.srcNames(f.a); got != want {
		t.Fatalf("order = %s", got)
	}
	for i, s := range out {
		if s.ID != ids[i] || s.SortOrder != (i+1)*10 {
			t.Fatalf("returned[%d] = %+v", i, s)
		}
	}

	bJob := f.src(f.b, "Job")
	for name, bad := range map[string][]int64{
		"missing one":  {other.ID, gig.ID},
		"repeated":     {other.ID, gig.ID, gig.ID},
		"extra":        {other.ID, gig.ID, job.ID, 9999},
		"unknown":      {other.ID, gig.ID, 9999},
		"other user's": {other.ID, gig.ID, bJob.ID},
		"empty":        nil,
	} {
		_, err := f.s.Reorder(ctx, f.a, bad)
		wantValidation(t, err, "ids")
		if got := f.srcNames(f.a); got != want {
			t.Fatalf("%s changed the order: %s", name, got)
		}
	}
	if got := f.srcNames(f.b); got != "Job,Other" {
		t.Fatalf("user B order changed: %s", got)
	}
}

func TestDeleteIncomeSourceWithoutEntries(t *testing.T) {
	f := newSrcFixture(t)
	ctx := context.Background()
	job, gig := f.create(f.a, "Job"), f.create(f.a, "Gig")
	other := f.src(f.a, "Other")
	moved := f.addTemplateItem(f.a, job.ID)
	kept := f.addTemplateItem(f.a, gig.ID)

	if err := f.s.Delete(ctx, f.a, job.ID); err != nil {
		t.Fatal(err)
	}
	if got := f.srcNames(f.a); got != "Gig,Other" {
		t.Fatalf("after delete = %s", got)
	}
	if n := f.count(`SELECT count(*) FROM template_income_items WHERE id = ? AND income_source_id = ?`, moved, other.ID); n != 1 {
		t.Error("template item not moved to Other")
	}
	if n := f.count(`SELECT count(*) FROM template_income_items WHERE id = ? AND income_source_id = ?`, kept, gig.ID); n != 1 {
		t.Error("unrelated template item moved")
	}
	if err := f.s.Delete(ctx, f.a, job.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second delete = %v", err)
	}
}

func TestDeleteIncomeSourceWithEntriesIsRejected(t *testing.T) {
	f := newSrcFixture(t)
	ctx := context.Background()
	job := f.create(f.a, "Job")
	item := f.addTemplateItem(f.a, job.ID)
	entry := f.addEntry(f.a, job.ID)

	if err := f.s.Delete(ctx, f.a, job.ID); !errors.Is(err, ErrSourceHasEntries) {
		t.Fatalf("delete = %v", err)
	}
	// Nothing changed: the source, its entry and its template item all stay.
	if got := f.srcNames(f.a); got != "Job,Other" {
		t.Fatalf("sources = %s", got)
	}
	if n := f.count(`SELECT count(*) FROM income_entries WHERE id = ? AND income_source_id = ?`, entry, job.ID); n != 1 {
		t.Error("entry changed")
	}
	if n := f.count(`SELECT count(*) FROM template_income_items WHERE id = ? AND income_source_id = ?`, item, job.ID); n != 1 {
		t.Error("template item moved although the delete was rejected")
	}

	// Once its entries are gone, it can be deleted.
	f.exec(`DELETE FROM income_entries WHERE id = ?`, entry)
	if err := f.s.Delete(ctx, f.a, job.ID); err != nil {
		t.Fatalf("delete after entries removed = %v", err)
	}
}

func TestIncomeSourceTenancyIsolation(t *testing.T) {
	f := newSrcFixture(t)
	ctx := context.Background()
	bJob, bOther := f.create(f.b, "Job"), f.src(f.b, "Other")
	bItem := f.addTemplateItem(f.b, bJob.ID)

	// User A cannot see, rename or delete B's sources, protected or not.
	for _, id := range []int64{bJob.ID, bOther.ID} {
		if _, err := f.s.Rename(ctx, f.a, id, "Mine"); !errors.Is(err, ErrNotFound) {
			t.Errorf("rename %d = %v", id, err)
		}
		if err := f.s.Delete(ctx, f.a, id); !errors.Is(err, ErrNotFound) {
			t.Errorf("delete %d = %v", id, err)
		}
	}
	if got := f.srcNames(f.b); got != "Job,Other" {
		t.Fatalf("B's sources = %s", got)
	}
	if n := f.count(`SELECT count(*) FROM template_income_items WHERE id = ? AND income_source_id = ?`, bItem, bJob.ID); n != 1 {
		t.Fatal("B's template item moved")
	}

	// B's entries never mark A's same-named source as having entries.
	aJob := f.create(f.a, "Job")
	f.addEntry(f.b, bJob.ID)
	if f.src(f.a, "Job").HasEntries {
		t.Fatal("A's source reports B's entries")
	}
	// Deleting A's source leaves B's alone, and moves A's items to A's Other.
	aItem := f.addTemplateItem(f.a, aJob.ID)
	if err := f.s.Delete(ctx, f.a, aJob.ID); err != nil {
		t.Fatal(err)
	}
	if n := f.count(`SELECT count(*) FROM template_income_items WHERE id = ? AND income_source_id = ?`, aItem, f.src(f.a, "Other").ID); n != 1 {
		t.Fatal("A's item not moved to A's Other")
	}
	if got := f.srcNames(f.b); got != "Job,Other" {
		t.Fatalf("B's sources after A's delete = %s", got)
	}
}

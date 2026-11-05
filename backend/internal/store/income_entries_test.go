package store

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
)

// entryFixture is a database with two seeded users, A and B.
type entryFixture struct {
	*srcFixture
	e IncomeEntries
}

func newEntryFixture(t *testing.T) *entryFixture {
	t.Helper()
	sf := newSrcFixture(t)
	return &entryFixture{srcFixture: sf, e: IncomeEntries{DB: sf.db}}
}

// add creates a confirmed entry with generic figures on date.
func (f *entryFixture) add(user, source int64, date string) IncomeEntry {
	f.t.Helper()
	e, err := f.e.Create(context.Background(), user, NewIncomeEntry{
		SourceID: source, Date: date, GrossCents: 10000, GrossTaxableCents: 9000, NetCents: 7000, Confirmed: true,
	})
	if err != nil {
		f.t.Fatal(err)
	}
	return e
}

// dates lists the user's entries matching flt as "date#id" in result order.
func (f *entryFixture) dates(user int64, flt IncomeEntryFilter) []string {
	f.t.Helper()
	page, err := f.e.List(context.Background(), user, flt)
	if err != nil {
		f.t.Fatal(err)
	}
	out := []string{}
	for _, e := range page.Items {
		out = append(out, e.Date)
	}
	return out
}

func wantField(t *testing.T, err error, field string) {
	t.Helper()
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Field != field {
		t.Fatalf("err = %v, want validation error on %s", err, field)
	}
}

func TestCreateAndGetIncomeEntry(t *testing.T) {
	f := newEntryFixture(t)
	ctx := context.Background()
	job := f.create(f.a, "Job")

	e, err := f.e.Create(ctx, f.a, NewIncomeEntry{
		SourceID: job.ID, Date: "2026-03-15", GrossCents: 250000, GrossTaxableCents: 230000, NetCents: 180000,
		Note: ptr("  bonus  "), Confirmed: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if e.ID == 0 || e.SourceID != job.ID || e.Date != "2026-03-15" ||
		e.GrossCents != 250000 || e.GrossTaxableCents != 230000 || e.NetCents != 180000 ||
		!e.Confirmed || e.TemplateApplyID != nil || e.CreatedAt.IsZero() || e.UpdatedAt.IsZero() {
		t.Fatalf("created = %+v", e)
	}
	if e.Note == nil || *e.Note != "bonus" {
		t.Fatalf("note = %v, want trimmed", e.Note)
	}
	got, err := f.e.Get(ctx, f.a, e.ID)
	if err != nil || !reflect.DeepEqual(got, e) {
		t.Fatalf("get = %+v, %v; want %+v", got, err, e)
	}

	// Unconfirmed, with a blank note stored as NULL.
	u, err := f.e.Create(ctx, f.a, NewIncomeEntry{
		SourceID: job.ID, Date: "2026-03-31", GrossCents: 0, GrossTaxableCents: 0, NetCents: 0, Note: ptr("   "),
	})
	if err != nil {
		t.Fatal(err)
	}
	if u.Confirmed || u.Note != nil {
		t.Fatalf("unconfirmed = %+v", u)
	}
	if n := f.count(`SELECT count(*) FROM income_entries WHERE id = ? AND note IS NULL AND confirmed = 0`, u.ID); n != 1 {
		t.Fatal("blank note not stored as NULL")
	}

	if _, err := f.e.Get(ctx, f.a, 999999); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get missing = %v", err)
	}
}

func TestIncomeEntryValidation(t *testing.T) {
	f := newEntryFixture(t)
	ctx := context.Background()
	job := f.create(f.a, "Job")
	ok := NewIncomeEntry{SourceID: job.ID, Date: "2026-01-01", GrossCents: 1000, GrossTaxableCents: 1000, NetCents: 800}

	for _, tc := range []struct {
		field string
		edit  func(*NewIncomeEntry)
	}{
		{"gross_taxable_cents", func(n *NewIncomeEntry) { n.GrossTaxableCents = 1001 }},
		{"net_cents", func(n *NewIncomeEntry) { n.NetCents = 1001 }},
		{"gross_cents", func(n *NewIncomeEntry) { n.GrossCents = -1 }},
		{"gross_taxable_cents", func(n *NewIncomeEntry) { n.GrossTaxableCents = -1 }},
		{"net_cents", func(n *NewIncomeEntry) { n.NetCents = -1 }},
		{"date", func(n *NewIncomeEntry) { n.Date = "2026-02-30" }},
		{"date", func(n *NewIncomeEntry) { n.Date = "2026-1-5" }},
		{"note", func(n *NewIncomeEntry) { n.Note = ptr(strings.Repeat("é", 501)) }},
		{"income_source_id", func(n *NewIncomeEntry) { n.SourceID = 0 }},
		{"income_source_id", func(n *NewIncomeEntry) { n.SourceID = 999999 }},
	} {
		n := ok
		tc.edit(&n)
		_, err := f.e.Create(ctx, f.a, n)
		wantField(t, err, tc.field)
	}
	if n := f.count(`SELECT count(*) FROM income_entries`); n != 0 {
		t.Fatalf("%d rows written by rejected creates", n)
	}

	// Boundaries are allowed: taxable and net equal to gross, a 500-character note.
	n := ok
	n.NetCents, n.Note = 1000, ptr(strings.Repeat("é", 500))
	if _, err := f.e.Create(ctx, f.a, n); err != nil {
		t.Fatal(err)
	}
}

func TestUpdateIncomeEntry(t *testing.T) {
	f := newEntryFixture(t)
	ctx := context.Background()
	job, side := f.create(f.a, "Job"), f.create(f.a, "Side gig")

	e, err := f.e.Create(ctx, f.a, NewIncomeEntry{
		SourceID: job.ID, Date: "2026-01-10", GrossCents: 1000, GrossTaxableCents: 900, NetCents: 700, Note: ptr("first"),
	})
	if err != nil {
		t.Fatal(err)
	}

	// Editing an unconfirmed entry confirms it, and leaves other fields alone.
	got, err := f.e.Update(ctx, f.a, e.ID, IncomeEntryPatch{NetCents: ptr[int64](650)})
	if err != nil {
		t.Fatal(err)
	}
	if !got.Confirmed || got.NetCents != 650 || got.GrossCents != 1000 || got.GrossTaxableCents != 900 ||
		got.Date != "2026-01-10" || got.SourceID != job.ID || got.Note == nil || *got.Note != "first" {
		t.Fatalf("after net edit = %+v", got)
	}
	if got.UpdatedAt.Before(e.UpdatedAt) || got.CreatedAt != e.CreatedAt {
		t.Fatalf("timestamps = %v / %v", got.CreatedAt, got.UpdatedAt)
	}

	// Every field can change at once; confirmed:false is kept; a nil note clears it.
	got, err = f.e.Update(ctx, f.a, e.ID, IncomeEntryPatch{
		SourceID: &side.ID, Date: ptr("2026-02-01"), GrossCents: ptr[int64](2000),
		GrossTaxableCents: ptr[int64](2000), NetCents: ptr[int64](1500),
		SetNote: true, Note: nil, Confirmed: ptr(false),
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.Confirmed || got.SourceID != side.ID || got.Date != "2026-02-01" || got.GrossCents != 2000 ||
		got.GrossTaxableCents != 2000 || got.NetCents != 1500 || got.Note != nil {
		t.Fatalf("after full edit = %+v", got)
	}

	// Only confirming.
	got, err = f.e.Update(ctx, f.a, e.ID, IncomeEntryPatch{Confirmed: ptr(true)})
	if err != nil || !got.Confirmed {
		t.Fatalf("confirm = %+v, %v", got, err)
	}

	// The merged result is checked against the stored figures.
	before := got
	_, err = f.e.Update(ctx, f.a, e.ID, IncomeEntryPatch{GrossCents: ptr[int64](1999)})
	wantField(t, err, "gross_taxable_cents")
	_, err = f.e.Update(ctx, f.a, e.ID, IncomeEntryPatch{NetCents: ptr[int64](2001)})
	wantField(t, err, "net_cents")
	_, err = f.e.Update(ctx, f.a, e.ID, IncomeEntryPatch{GrossTaxableCents: ptr[int64](2001)})
	wantField(t, err, "gross_taxable_cents")
	_, err = f.e.Update(ctx, f.a, e.ID, IncomeEntryPatch{Date: ptr("not-a-date")})
	wantField(t, err, "date")
	_, err = f.e.Update(ctx, f.a, e.ID, IncomeEntryPatch{SourceID: ptr[int64](999999)})
	wantField(t, err, "income_source_id")
	_, err = f.e.Update(ctx, f.a, e.ID, IncomeEntryPatch{})
	wantField(t, err, "body")
	if after, _ := f.e.Get(ctx, f.a, e.ID); !reflect.DeepEqual(after, before) {
		t.Fatalf("rejected updates changed the row: %+v", after)
	}

	if _, err := f.e.Update(ctx, f.a, 999999, IncomeEntryPatch{Confirmed: ptr(true)}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("update missing = %v", err)
	}
}

func TestDeleteIncomeEntry(t *testing.T) {
	f := newEntryFixture(t)
	ctx := context.Background()
	job := f.create(f.a, "Job")
	e1, e2 := f.add(f.a, job.ID, "2026-01-01"), f.add(f.a, job.ID, "2026-01-02")

	if err := f.e.Delete(ctx, f.a, e1.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.e.Get(ctx, f.a, e1.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get deleted = %v", err)
	}
	if err := f.e.Delete(ctx, f.a, e1.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete twice = %v", err)
	}
	if _, err := f.e.Get(ctx, f.a, e2.ID); err != nil {
		t.Fatalf("other entry gone: %v", err)
	}
	// With its last entry gone the source can be deleted again.
	if err := f.e.Delete(ctx, f.a, e2.ID); err != nil {
		t.Fatal(err)
	}
	if f.src(f.a, "Job").HasEntries {
		t.Fatal("source still has entries")
	}
}

func TestListIncomeEntriesByMonth(t *testing.T) {
	f := newEntryFixture(t)
	job, side := f.create(f.a, "Job"), f.create(f.a, "Side gig")
	for _, d := range []string{"2025-12-31", "2026-01-01", "2026-01-15", "2026-01-31", "2026-02-01", "2024-02-29"} {
		f.add(f.a, job.ID, d)
	}
	f.add(f.a, side.ID, "2026-01-20")

	for _, tc := range []struct {
		name string
		flt  IncomeEntryFilter
		want string
	}{
		{"all, newest first", IncomeEntryFilter{}, "2026-02-01,2026-01-31,2026-01-20,2026-01-15,2026-01-01,2025-12-31,2024-02-29"},
		{"january", IncomeEntryFilter{Month: ptr("2026-01")}, "2026-01-31,2026-01-20,2026-01-15,2026-01-01"},
		{"december", IncomeEntryFilter{Month: ptr("2025-12")}, "2025-12-31"},
		{"leap february", IncomeEntryFilter{Month: ptr("2024-02")}, "2024-02-29"},
		{"empty month", IncomeEntryFilter{Month: ptr("2026-03")}, ""},
		{"month and source", IncomeEntryFilter{Month: ptr("2026-01"), SourceID: &side.ID}, "2026-01-20"},
		{"from only", IncomeEntryFilter{From: ptr("2026-01-31")}, "2026-02-01,2026-01-31"},
		{"to only", IncomeEntryFilter{To: ptr("2026-01-01")}, "2026-01-01,2025-12-31,2024-02-29"},
		{"from and to, inclusive", IncomeEntryFilter{From: ptr("2025-12-31"), To: ptr("2026-01-15")}, "2026-01-15,2026-01-01,2025-12-31"},
		{"unknown source", IncomeEntryFilter{SourceID: ptr[int64](0)}, ""},
	} {
		if got := strings.Join(f.dates(f.a, tc.flt), ","); got != tc.want {
			t.Errorf("%s = %s, want %s", tc.name, got, tc.want)
		}
	}
}

func TestListIncomeEntriesConfirmedFilter(t *testing.T) {
	f := newEntryFixture(t)
	ctx := context.Background()
	job := f.create(f.a, "Job")
	f.add(f.a, job.ID, "2026-01-01")
	if _, err := f.e.Create(ctx, f.a, NewIncomeEntry{SourceID: job.ID, Date: "2026-01-02", GrossCents: 1}); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(f.dates(f.a, IncomeEntryFilter{Confirmed: ptr(false)}), ","); got != "2026-01-02" {
		t.Errorf("unconfirmed = %s", got)
	}
	if got := strings.Join(f.dates(f.a, IncomeEntryFilter{Confirmed: ptr(true)}), ","); got != "2026-01-01" {
		t.Errorf("confirmed = %s", got)
	}
}

func TestListIncomeEntriesRejectsBadFilters(t *testing.T) {
	f := newEntryFixture(t)
	ctx := context.Background()
	for _, tc := range []struct {
		field string
		flt   IncomeEntryFilter
	}{
		{"month", IncomeEntryFilter{Month: ptr("2026-01"), From: ptr("2026-01-01")}},
		{"month", IncomeEntryFilter{Month: ptr("2026-01"), To: ptr("2026-01-31")}},
		{"month", IncomeEntryFilter{Month: ptr("2026-13")}},
		{"month", IncomeEntryFilter{Month: ptr("")}},
		{"from", IncomeEntryFilter{From: ptr("2026-02-01"), To: ptr("2026-01-31")}},
		{"from", IncomeEntryFilter{From: ptr("yesterday")}},
		{"to", IncomeEntryFilter{To: ptr("2026-02-30")}},
		{"limit", IncomeEntryFilter{Limit: ptr(0)}},
		{"limit", IncomeEntryFilter{Limit: ptr(MaxListLimit + 1)}},
		{"cursor", IncomeEntryFilter{Cursor: ptr("not a cursor")}},
		{"cursor", IncomeEntryFilter{Cursor: ptr("")}},
	} {
		_, err := f.e.List(ctx, f.a, tc.flt)
		wantField(t, err, tc.field)
	}
}

func TestListIncomeEntriesPaginates(t *testing.T) {
	f := newEntryFixture(t)
	ctx := context.Background()
	job := f.create(f.a, "Job")
	// Two entries share a day, so the cursor has to break ties by id.
	var want []int64
	for _, d := range []string{"2026-01-01", "2026-01-02", "2026-01-02", "2026-01-03", "2026-02-01"} {
		want = append([]int64{f.add(f.a, job.ID, d).ID}, want...)
	}

	var got []int64
	flt := IncomeEntryFilter{Limit: ptr(2)}
	pages := 0
	for {
		page, err := f.e.List(ctx, f.a, flt)
		if err != nil {
			t.Fatal(err)
		}
		pages++
		if len(page.Items) > 2 {
			t.Fatalf("page of %d", len(page.Items))
		}
		for _, e := range page.Items {
			got = append(got, e.ID)
		}
		if page.NextCursor == nil {
			break
		}
		flt.Cursor = page.NextCursor
	}
	if pages != 3 {
		t.Fatalf("pages = %d", pages)
	}
	// Newest date first; within 2026-01-02 the later id comes first.
	if len(got) != len(want) {
		t.Fatalf("ids = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("ids = %v, want %v", got, want)
		}
	}

	// An exact fit has no next page.
	page, err := f.e.List(ctx, f.a, IncomeEntryFilter{Limit: ptr(5)})
	if err != nil || len(page.Items) != 5 || page.NextCursor != nil {
		t.Fatalf("exact page = %d items, cursor %v, %v", len(page.Items), page.NextCursor, err)
	}
	// The cursor combines with filters.
	page, err = f.e.List(ctx, f.a, IncomeEntryFilter{Month: ptr("2026-01"), Limit: ptr(1)})
	if err != nil || page.NextCursor == nil {
		t.Fatalf("january page 1 = %+v, %v", page, err)
	}
	page, err = f.e.List(ctx, f.a, IncomeEntryFilter{Month: ptr("2026-01"), Limit: ptr(10), Cursor: page.NextCursor})
	if err != nil || len(page.Items) != 3 || page.NextCursor != nil {
		t.Fatalf("january page 2 = %d items, %v", len(page.Items), err)
	}
}

func TestIncomeEntryTemplateApplyID(t *testing.T) {
	f := newEntryFixture(t)
	ctx := context.Background()
	job := f.create(f.a, "Job")
	e := f.add(f.a, job.ID, "2026-01-01")
	apply := f.exec(`INSERT INTO template_applies (user_id, year_month) VALUES (?, '2026-01')`, f.a)
	f.exec(`UPDATE income_entries SET template_apply_id = ? WHERE id = ?`, apply, e.ID)

	got, err := f.e.Get(ctx, f.a, e.ID)
	if err != nil || got.TemplateApplyID == nil || *got.TemplateApplyID != apply {
		t.Fatalf("apply id = %v, %v", got.TemplateApplyID, err)
	}
	// Editing keeps the link.
	got, err = f.e.Update(ctx, f.a, e.ID, IncomeEntryPatch{NetCents: ptr[int64](1)})
	if err != nil || got.TemplateApplyID == nil || *got.TemplateApplyID != apply {
		t.Fatalf("apply id after edit = %v, %v", got.TemplateApplyID, err)
	}
}

func TestIncomeEntryTenancyIsolation(t *testing.T) {
	f := newEntryFixture(t)
	ctx := context.Background()
	aJob, bJob := f.create(f.a, "Job"), f.create(f.b, "Job")
	aEntry := f.add(f.a, aJob.ID, "2026-01-15")
	bEntry := f.add(f.b, bJob.ID, "2026-01-15")

	// A cannot get, edit or delete B's entry.
	if _, err := f.e.Get(ctx, f.a, bEntry.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("get = %v", err)
	}
	if _, err := f.e.Update(ctx, f.a, bEntry.ID, IncomeEntryPatch{NetCents: ptr[int64](1)}); !errors.Is(err, ErrNotFound) {
		t.Errorf("update = %v", err)
	}
	if err := f.e.Delete(ctx, f.a, bEntry.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("delete = %v", err)
	}
	if got, err := f.e.Get(ctx, f.b, bEntry.ID); err != nil || !reflect.DeepEqual(got, bEntry) {
		t.Fatalf("B's entry changed: %+v, %v", got, err)
	}

	// A's lists never include B's entries, even filtered by B's source.
	for _, flt := range []IncomeEntryFilter{{}, {Month: ptr("2026-01")}, {SourceID: &bJob.ID}} {
		page, err := f.e.List(ctx, f.a, flt)
		if err != nil {
			t.Fatal(err)
		}
		for _, e := range page.Items {
			if e.ID == bEntry.ID {
				t.Fatalf("A's list %+v has B's entry", flt)
			}
		}
	}
	if got := f.dates(f.a, IncomeEntryFilter{}); len(got) != 1 {
		t.Fatalf("A's entries = %v", got)
	}

	// A cannot file an entry under B's source, nor move one there.
	_, err := f.e.Create(ctx, f.a, NewIncomeEntry{SourceID: bJob.ID, Date: "2026-01-01", GrossCents: 1})
	wantField(t, err, "income_source_id")
	_, err = f.e.Update(ctx, f.a, aEntry.ID, IncomeEntryPatch{SourceID: &bJob.ID})
	wantField(t, err, "income_source_id")
	if n := f.count(`SELECT count(*) FROM income_entries WHERE user_id = ?`, f.b); n != 1 {
		t.Fatalf("B has %d entries", n)
	}
	if f.src(f.b, "Job").HasEntries != true || f.src(f.a, "Job").HasEntries != true {
		t.Fatal("has_entries mixed up between users")
	}
}

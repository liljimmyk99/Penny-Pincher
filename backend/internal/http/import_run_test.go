package http

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/importrun"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

// runFile is a file of five expenses over two years and one income entry.
func runFile(t *testing.T) []byte {
	return xlsx(t,
		[][]any{
			{"2019-12-30", "Food", "Corner Shop", "10"},
			{"2020-01-02", "Food", "corner shop", "20"},
			{"2020-01-03", "Food", "Cafe", "30"},
			{"2020-02-04", "Food", "Cafe", "-5"},
			{"2020-02-05", "Food", "Market", "40.25"},
		},
		[][]any{{"2020-01-31", "Other", "1000", "900", "700"}})
}

// gate pauses a run after its first batch until release is called.
type gate struct {
	hit     chan struct{}
	release chan struct{}
}

func newGate() *gate { return &gate{hit: make(chan struct{}, 10), release: make(chan struct{})} }

func (g *gate) hook(int64) {
	g.hit <- struct{}{}
	<-g.release
}

func runnerAPI(t *testing.T, o importrun.Options) *testAPI {
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	return newTestAPIWith(t, func(db *sql.DB, d *Deps) { d.ImportRunner = importrun.New(ctx, db, o) })
}

func (a *testAPI) importJSON(rec *httptest.ResponseRecorder, wantStatus int) api.Import {
	a.t.Helper()
	if rec.Code != wantStatus {
		a.t.Fatalf("status = %d, want %d (%s)", rec.Code, wantStatus, rec.Body)
	}
	var imp api.Import
	if err := json.Unmarshal(rec.Body.Bytes(), &imp); err != nil {
		a.t.Fatal(err)
	}
	return imp
}

func (a *testAPI) waitStatus(token, id string, want api.ImportStatus) api.Import {
	a.t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		imp := a.importJSON(a.call("GET", "/v1/imports/"+id, token, ""), 200)
		if imp.Status == want {
			return imp
		}
		if time.Now().After(deadline) {
			a.t.Fatalf("status = %s, want %s", imp.Status, want)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func (a *testAPI) memberID() int64 {
	var id int64
	if err := a.db.QueryRow(`SELECT id FROM users WHERE firebase_uid = 'uid-member'`).Scan(&id); err != nil {
		a.t.Fatal(err)
	}
	return id
}

func (a *testAPI) handExpense(cents int64, date string, refunds *int64) store.Expense {
	a.t.Helper()
	uid := a.memberID()
	var cat int64
	a.db.QueryRow(`SELECT id FROM categories WHERE user_id = ? AND name = 'Food'`, uid).Scan(&cat)
	e, err := store.Expenses{DB: a.db}.Create(context.Background(), uid, store.NewExpense{
		Date: date, AmountCents: cents, CategoryID: cat, MerchantName: "By Hand", RefundedExpenseID: refunds, Confirmed: true,
	})
	if err != nil {
		a.t.Fatal(err)
	}
	return e
}

func TestImportFullRun(t *testing.T) {
	a := runnerAPI(t, importrun.Options{BatchSize: 2})
	imp := a.uploadOK(tokMember, "h.xlsx", runFile(t))
	if imp.RowsReady != 6 {
		t.Fatalf("ready = %d", imp.RowsReady)
	}
	started := a.importJSON(a.call("POST", "/v1/imports/"+imp.Id+"/start", tokMember, ""), 202)
	if started.Status != api.ImportStatus("running") && started.Status != api.ImportStatus("completed") {
		t.Fatalf("started status = %s", started.Status)
	}
	done := a.waitStatus(tokMember, imp.Id, "completed")
	if done.EntriesImported != 6 || done.Progress != nil || done.FinishedAt.IsNull() {
		t.Fatalf("done = %+v", done)
	}
	if a.count("expenses") != 5 || a.count("income_entries") != 1 {
		t.Fatalf("entries = %d expenses, %d income", a.count("expenses"), a.count("income_entries"))
	}
	var tagged, confirmed, merchants int
	a.db.QueryRow(`SELECT count(*), sum(confirmed) FROM expenses WHERE import_id = ?`, imp.Id).Scan(&tagged, &confirmed)
	if tagged != 5 || confirmed != 5 {
		t.Fatalf("tagged = %d confirmed = %d", tagged, confirmed)
	}
	a.db.QueryRow(`SELECT count(*) FROM merchants WHERE name = 'Corner Shop'`).Scan(&merchants)
	if merchants != 1 {
		t.Fatalf("merchants = %d, want one (case-insensitive)", merchants)
	}
	// Finished imports cannot be started again, cancelled, or run twice.
	wantError(t, a.call("POST", "/v1/imports/"+imp.Id+"/start", tokMember, ""), 409, api.ErrorErrorCodeImportWrongStatus)
	wantError(t, a.call("POST", "/v1/imports/"+imp.Id+"/cancel", tokMember, ""), 409, api.ErrorErrorCodeImportWrongStatus)
}

func TestImportProgressWhileRunning(t *testing.T) {
	g := newGate()
	a := runnerAPI(t, importrun.Options{BatchSize: 2, AfterBatch: g.hook})
	imp := a.uploadOK(tokMember, "h.xlsx", runFile(t))
	a.call("POST", "/v1/imports/"+imp.Id+"/start", tokMember, "")
	<-g.hit

	got := a.importJSON(a.call("GET", "/v1/imports/"+imp.Id, tokMember, ""), 200)
	p := got.Progress
	if got.Status != "running" || p == nil || p.RowsDone != 2 || p.RowsTotal != 6 {
		t.Fatalf("running import = %+v progress = %+v", got, p)
	}
	if m, err := p.CurrentMonth.Get(); err != nil || m != "2019-12" && m != "2020-01" {
		t.Fatalf("current month = %q, %v", m, err)
	}
	if eta, err := p.EtaSeconds.Get(); err != nil || eta < 0 {
		t.Fatalf("eta = %d, %v", eta, err)
	}
	if len(p.Years) != 2 || p.Years[0].Year != 2019 || p.Years[0].RowsTotal != 1 || p.Years[1].Year != 2020 || p.Years[1].RowsTotal != 5 {
		t.Fatalf("years = %+v", p.Years)
	}
	close(g.release)
	a.waitStatus(tokMember, imp.Id, "completed")
}

func TestImportSecondStartConflicts(t *testing.T) {
	g := newGate()
	a := runnerAPI(t, importrun.Options{BatchSize: 2, AfterBatch: g.hook})
	first := a.uploadOK(tokMember, "1.xlsx", runFile(t))
	second := a.uploadOK(tokMember, "2.xlsx", runFile(t))
	a.call("POST", "/v1/imports/"+first.Id+"/start", tokMember, "")
	<-g.hit

	wantError(t, a.call("POST", "/v1/imports/"+second.Id+"/start", tokMember, ""), 409, api.ErrorErrorCodeImportInProgress)
	wantError(t, a.call("POST", "/v1/imports/"+first.Id+"/start", tokMember, ""), 409, api.ErrorErrorCodeImportWrongStatus)
	if got := a.importJSON(a.call("GET", "/v1/imports/"+second.Id, tokMember, ""), 200); got.Status != "review" {
		t.Fatalf("second = %s, want review", got.Status)
	}
	// Another user is not blocked.
	other := a.uploadOK(tokAdmin, "3.xlsx", runFile(t))
	a.importJSON(a.call("POST", "/v1/imports/"+other.Id+"/start", tokAdmin, ""), 202)
	close(g.release)
	a.waitStatus(tokMember, first.Id, "completed")
	a.waitStatus(tokAdmin, other.Id, "completed")
}

func TestImportCancelMidRun(t *testing.T) {
	g := newGate()
	a := runnerAPI(t, importrun.Options{BatchSize: 2, AfterBatch: g.hook})
	byHand := a.handExpense(700, "2020-01-20", nil)
	imp := a.uploadOK(tokMember, "h.xlsx", runFile(t))
	a.call("POST", "/v1/imports/"+imp.Id+"/start", tokMember, "")
	<-g.hit
	if a.count("expenses") < 2 {
		t.Fatal("first batch not written")
	}

	cancelled := make(chan *httptest.ResponseRecorder, 1)
	go func() { cancelled <- a.call("POST", "/v1/imports/"+imp.Id+"/cancel", tokMember, "") }()
	time.Sleep(50 * time.Millisecond) // let the cancel reach the runner
	close(g.release)

	got := a.importJSON(<-cancelled, 200)
	if got.Status != "cancelled" || got.EntriesImported != 0 {
		t.Fatalf("cancelled = %+v", got)
	}
	if a.count("expenses") != 1 || a.count("income_entries") != 0 {
		t.Fatalf("left %d expenses, %d income; want only the hand-made one", a.count("expenses"), a.count("income_entries"))
	}
	var id int64
	if err := a.db.QueryRow(`SELECT id FROM expenses`).Scan(&id); err != nil || id != byHand.ID {
		t.Fatalf("remaining expense = %d, %v", id, err)
	}
	wantError(t, a.call("POST", "/v1/imports/"+imp.Id+"/cancel", tokMember, ""), 409, api.ErrorErrorCodeImportWrongStatus)
	// The user can run another import now.
	next := a.uploadOK(tokMember, "n.xlsx", runFile(t))
	a.importJSON(a.call("POST", "/v1/imports/"+next.Id+"/start", tokMember, ""), 202)
}

func TestImportUndoAfterEdit(t *testing.T) {
	a := runnerAPI(t, importrun.Options{BatchSize: 2})
	imp := a.uploadOK(tokMember, "h.xlsx", runFile(t))
	wantError(t, a.call("POST", "/v1/imports/"+imp.Id+"/undo", tokMember, ""), 409, api.ErrorErrorCodeImportWrongStatus)
	a.call("POST", "/v1/imports/"+imp.Id+"/start", tokMember, "")
	a.waitStatus(tokMember, imp.Id, "completed")

	var imported int64
	a.db.QueryRow(`SELECT id FROM expenses WHERE import_id = ? AND amount_cents = 3000`, imp.Id).Scan(&imported)
	if rec := a.call("PATCH", fmt.Sprintf("/v1/expenses/%d", imported), tokMember, `{"note":"edited"}`); rec.Code != 200 {
		t.Fatalf("edit: %d %s", rec.Code, rec.Body)
	}
	refund := a.handExpense(-500, "2020-03-01", &imported)
	byHand := a.handExpense(700, "2020-01-20", nil)

	got := a.importJSON(a.call("POST", "/v1/imports/"+imp.Id+"/undo", tokMember, ""), 200)
	if got.Status != "undone" || got.EntriesImported != 0 {
		t.Fatalf("undone = %+v", got)
	}
	if a.count("expenses") != 2 || a.count("income_entries") != 0 {
		t.Fatalf("left %d expenses, %d income", a.count("expenses"), a.count("income_entries"))
	}
	var link sql.NullInt64
	if err := a.db.QueryRow(`SELECT refunded_expense_id FROM expenses WHERE id = ?`, refund.ID).Scan(&link); err != nil || link.Valid {
		t.Fatalf("refund link = %v, %v; want kept and unlinked", link, err)
	}
	if err := a.db.QueryRow(`SELECT 1 FROM expenses WHERE id = ?`, byHand.ID).Scan(new(int)); err != nil {
		t.Fatalf("hand-made entry: %v", err)
	}
	wantError(t, a.call("POST", "/v1/imports/"+imp.Id+"/undo", tokMember, ""), 409, api.ErrorErrorCodeImportWrongStatus)
}

func TestImportFailsWhenCategoryWasRemoved(t *testing.T) {
	a := runnerAPI(t, importrun.Options{})
	rec := a.call("POST", "/v1/categories", tokMember, `{"name":"Travel"}`)
	if rec.Code != 201 {
		t.Fatal(rec.Body)
	}
	var cat api.Category
	json.Unmarshal(rec.Body.Bytes(), &cat)
	imp := a.uploadOK(tokMember, "h.xlsx", xlsx(t, [][]any{{"2020-01-02", "Travel", "Air", "10"}}, nil))
	if imp.RowsReady != 1 {
		t.Fatalf("ready = %d", imp.RowsReady)
	}
	a.call("DELETE", "/v1/categories/"+cat.Id, tokMember, "")

	got := a.importJSON(a.call("POST", "/v1/imports/"+imp.Id+"/start", tokMember, ""), 202)
	if got.Status != "failed" || a.count("expenses") != 0 {
		t.Fatalf("got = %+v expenses = %d", got, a.count("expenses"))
	}
	if r, err := got.FailureReason.Get(); err != nil || r == "" {
		t.Fatalf("failure reason = %q, %v", r, err)
	}
}

func TestImportRunTenancy(t *testing.T) {
	g := newGate()
	a := runnerAPI(t, importrun.Options{BatchSize: 2, AfterBatch: g.hook})
	imp := a.uploadOK(tokMember, "h.xlsx", runFile(t))
	for _, r := range [][2]string{
		{"POST", "start"}, {"POST", "cancel"}, {"POST", "undo"}, {"GET", "events"},
	} {
		wantError(t, a.call(r[0], "/v1/imports/"+imp.Id+"/"+r[1], tokAdmin, ""), 404, api.ErrorErrorCodeNotFound)
	}
	a.call("POST", "/v1/imports/"+imp.Id+"/start", tokMember, "")
	<-g.hit
	wantError(t, a.call("POST", "/v1/imports/"+imp.Id+"/cancel", tokAdmin, ""), 404, api.ErrorErrorCodeNotFound)
	if got := a.importJSON(a.call("GET", "/v1/imports/"+imp.Id, tokMember, ""), 200); got.Status != "running" {
		t.Fatalf("status = %s", got.Status)
	}
	close(g.release)
	a.waitStatus(tokMember, imp.Id, "completed")
}

// sseEvent is one parsed event of the stream; comments have name ":".
type sseEvent struct{ name, data string }

func readEvents(t *testing.T, resp *http.Response) <-chan sseEvent {
	out := make(chan sseEvent, 100)
	go func() {
		defer close(out)
		sc := bufio.NewScanner(resp.Body)
		var ev sseEvent
		for sc.Scan() {
			line := sc.Text()
			switch {
			case strings.HasPrefix(line, "event: "):
				ev.name = strings.TrimPrefix(line, "event: ")
			case strings.HasPrefix(line, "data: "):
				ev.data = strings.TrimPrefix(line, "data: ")
			case strings.HasPrefix(line, ":"):
				out <- sseEvent{name: ":"}
			case line == "" && ev.name != "":
				out <- ev
				ev = sseEvent{}
			}
		}
	}()
	return out
}

func TestImportEventStreamOrder(t *testing.T) {
	g := newGate()
	a := runnerAPI(t, importrun.Options{BatchSize: 2, AfterBatch: g.hook})
	srv := httptest.NewServer(a.h)
	defer srv.Close()
	imp := a.uploadOK(tokMember, "h.xlsx", runFile(t))
	a.call("POST", "/v1/imports/"+imp.Id+"/start", tokMember, "")
	<-g.hit

	req, _ := http.NewRequest("GET", srv.URL+"/v1/imports/"+imp.Id+"/events", nil)
	req.Header.Set("Authorization", "Bearer "+tokMember)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 || !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatalf("status = %d type = %q", resp.StatusCode, resp.Header.Get("Content-Type"))
	}
	events := readEvents(t, resp)

	first := <-events // sent on connect, before any release
	if first.name != "progress" {
		t.Fatalf("first event = %+v", first)
	}
	var p api.ImportProgress
	if err := json.Unmarshal([]byte(first.data), &p); err != nil || p.RowsDone != 2 || p.RowsTotal != 6 {
		t.Fatalf("first progress = %s, %v", first.data, err)
	}
	close(g.release)

	var names []string
	for ev := range events {
		names = append(names, ev.name)
		if ev.name == "finished" {
			var fin api.Import
			if err := json.Unmarshal([]byte(ev.data), &fin); err != nil || fin.Status != "completed" || fin.EntriesImported != 6 {
				t.Fatalf("finished = %s, %v", ev.data, err)
			}
		}
	}
	if len(names) == 0 || names[len(names)-1] != "finished" {
		t.Fatalf("events after connect = %v; want ... finished", names)
	}
	for _, n := range names[:len(names)-1] {
		if n != "progress" {
			t.Fatalf("events = %v; only progress may precede finished", names)
		}
	}
	// Reopening a finished import gives a single finished event and closes.
	req2, _ := http.NewRequest("GET", srv.URL+"/v1/imports/"+imp.Id+"/events", nil)
	req2.Header.Set("Authorization", "Bearer "+tokMember)
	resp2, err := http.DefaultClient.Do(req2)
	if err != nil {
		t.Fatal(err)
	}
	defer resp2.Body.Close()
	var again []string
	for ev := range readEvents(t, resp2) {
		again = append(again, ev.name)
	}
	if len(again) != 1 || again[0] != "finished" {
		t.Fatalf("events for finished import = %v", again)
	}
}

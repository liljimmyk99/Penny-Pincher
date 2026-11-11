package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

type entryList struct {
	Items      []map[string]any `json:"items"`
	NextCursor *string          `json:"next_cursor"`
}

func (a *testAPI) createIncomeEntry(token, body string) map[string]any {
	a.t.Helper()
	rec := a.call("POST", "/v1/income-entries", token, body)
	if rec.Code != http.StatusCreated {
		a.t.Fatalf("create status = %d (%s)", rec.Code, rec.Body)
	}
	var e map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &e); err != nil {
		a.t.Fatal(err)
	}
	return e
}

// entryOn creates a generic confirmed entry for sourceID on date.
func (a *testAPI) entryOn(token, sourceID, date string) map[string]any {
	a.t.Helper()
	return a.createIncomeEntry(token, fmt.Sprintf(
		`{"income_source_id":%q,"date":%q,"gross_cents":10000,"gross_taxable_cents":9000,"net_cents":7000}`, sourceID, date))
}

func (a *testAPI) listIncomeEntries(token, query string) entryList {
	a.t.Helper()
	rec := a.call("GET", "/v1/income-entries"+query, token, "")
	if rec.Code != http.StatusOK {
		a.t.Fatalf("list %s status = %d (%s)", query, rec.Code, rec.Body)
	}
	var l entryList
	if err := json.Unmarshal(rec.Body.Bytes(), &l); err != nil {
		a.t.Fatal(err)
	}
	return l
}

func entryDates(l entryList) string {
	var d []string
	for _, e := range l.Items {
		d = append(d, e["date"].(string))
	}
	return strings.Join(d, ",")
}

func TestCreateAndGetIncomeEntryHTTP(t *testing.T) {
	a := newTestAPI(t)
	job := a.createIncomeSource(tokMember, "Job")

	e := a.createIncomeEntry(tokMember, `{"income_source_id":"`+job.Id+`","date":"2026-03-15",
		"gross_cents":250000,"gross_taxable_cents":230000,"net_cents":180000}`)
	want := map[string]any{
		"date": "2026-03-15", "income_source_id": job.Id, "gross_cents": 250000.0,
		"gross_taxable_cents": 230000.0, "net_cents": 180000.0, "note": nil,
		"confirmed": true, "template_apply_id": nil, "import_id": nil,
	}
	for k, v := range want {
		if got, ok := e[k]; !ok || got != v {
			t.Errorf("%s = %v (present %v), want %v", k, got, ok, v)
		}
	}
	// Exactly the spec's fields: in particular, no stored tax rate.
	for k := range e {
		switch k {
		case "id", "created_at", "updated_at":
		default:
			if _, ok := want[k]; !ok {
				t.Errorf("unexpected field %q", k)
			}
		}
	}
	for _, k := range []string{"id", "created_at", "updated_at"} {
		if _, ok := e[k].(string); !ok {
			t.Errorf("%s = %v", k, e[k])
		}
	}

	rec := a.call("GET", "/v1/income-entries/"+e["id"].(string), tokMember, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("get status = %d (%s)", rec.Code, rec.Body)
	}
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(got) != fmt.Sprint(e) {
		t.Fatalf("get = %v, want %v", got, e)
	}

	// Optional note and confirmed:false.
	u := a.createIncomeEntry(tokMember, `{"income_source_id":"`+job.Id+`","date":"2026-03-31",
		"gross_cents":100,"gross_taxable_cents":0,"net_cents":100,"note":"one-off","confirmed":false}`)
	if u["note"] != "one-off" || u["confirmed"] != false {
		t.Fatalf("unconfirmed = %v", u)
	}

	for _, id := range []string{"999999", "abc", "0"} {
		wantError(t, a.call("GET", "/v1/income-entries/"+id, tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	}
}

func TestCreateIncomeEntryValidationHTTP(t *testing.T) {
	a := newTestAPI(t)
	job := a.createIncomeSource(tokMember, "Job")
	src := `"income_source_id":"` + job.Id + `"`

	rec := a.call("POST", "/v1/income-entries", tokMember,
		`{`+src+`,"date":"2026-01-01","gross_cents":1000,"gross_taxable_cents":1001,"net_cents":800}`)
	wantError(t, rec, http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	var e api.Error
	if err := json.Unmarshal(rec.Body.Bytes(), &e); err != nil {
		t.Fatal(err)
	}
	if e.Error.Details == nil || (*e.Error.Details)[0].Field != "gross_taxable_cents" {
		t.Fatalf("details = %s", rec.Body)
	}

	for _, body := range []string{
		`{` + src + `,"date":"2026-01-01","gross_cents":1000,"gross_taxable_cents":1000,"net_cents":1001}`,
		`{` + src + `,"date":"2026-01-01","gross_cents":-1,"gross_taxable_cents":0,"net_cents":0}`,
		`{` + src + `,"gross_cents":1,"gross_taxable_cents":1,"net_cents":1}`,                     // no date
		`{` + src + `,"date":"2026-02-30","gross_cents":1,"gross_taxable_cents":1,"net_cents":1}`, // not a date
		`{` + src + `,"date":"2026-01-01","gross_cents":1.5,"gross_taxable_cents":1,"net_cents":1}`,
		`{` + src + `,"date":"2026-01-01","gross_cents":1,"gross_taxable_cents":1,"net_cents":1,"note":"` + strings.Repeat("x", 501) + `"}`,
		`{"income_source_id":"999999","date":"2026-01-01","gross_cents":1,"gross_taxable_cents":1,"net_cents":1}`,
		`{"income_source_id":"abc","date":"2026-01-01","gross_cents":1,"gross_taxable_cents":1,"net_cents":1}`,
		`{"date":"2026-01-01","gross_cents":1,"gross_taxable_cents":1,"net_cents":1}`,
		`not json`,
	} {
		wantError(t, a.call("POST", "/v1/income-entries", tokMember, body), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	}
	if l := a.listIncomeEntries(tokMember, ""); len(l.Items) != 0 {
		t.Fatalf("rejected creates wrote %v", l.Items)
	}
}

func TestUpdateIncomeEntryHTTP(t *testing.T) {
	a := newTestAPI(t)
	job, side := a.createIncomeSource(tokMember, "Job"), a.createIncomeSource(tokMember, "Side gig")
	e := a.createIncomeEntry(tokMember, `{"income_source_id":"`+job.Id+`","date":"2026-01-10",
		"gross_cents":1000,"gross_taxable_cents":900,"net_cents":700,"note":"first","confirmed":false}`)
	path := "/v1/income-entries/" + e["id"].(string)

	patch := func(body string) map[string]any {
		t.Helper()
		rec := a.call("PATCH", path, tokMember, body)
		if rec.Code != http.StatusOK {
			t.Fatalf("patch %s = %d (%s)", body, rec.Code, rec.Body)
		}
		var got map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatal(err)
		}
		return got
	}

	// Editing an unconfirmed entry confirms it; untouched fields stay.
	got := patch(`{"net_cents":650}`)
	if got["confirmed"] != true || got["net_cents"] != 650.0 || got["gross_cents"] != 1000.0 || got["note"] != "first" {
		t.Fatalf("after edit = %v", got)
	}
	// confirmed:false is honoured; null clears the note; source and date move.
	got = patch(`{"confirmed":false,"note":null,"income_source_id":"` + side.Id + `","date":"2026-02-01"}`)
	if got["confirmed"] != false || got["note"] != nil || got["income_source_id"] != side.Id || got["date"] != "2026-02-01" {
		t.Fatalf("after second edit = %v", got)
	}

	for _, body := range []string{
		`{}`,
		`{"gross_cents":600}`, // below taxable and net
		`{"date":"nope"}`,
		`{"income_source_id":"999999"}`,
		`{"income_source_id":"abc"}`,
	} {
		wantError(t, a.call("PATCH", path, tokMember, body), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	}
	for _, id := range []string{"999999", "abc"} {
		wantError(t, a.call("PATCH", "/v1/income-entries/"+id, tokMember, `{"net_cents":1}`), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	}
}

func TestDeleteIncomeEntryHTTP(t *testing.T) {
	a := newTestAPI(t)
	job := a.createIncomeSource(tokMember, "Job")
	e := a.entryOn(tokMember, job.Id, "2026-01-01")
	path := "/v1/income-entries/" + e["id"].(string)

	if rec := a.call("DELETE", path, tokMember, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d (%s)", rec.Code, rec.Body)
	}
	wantError(t, a.call("GET", path, tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("DELETE", path, tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("DELETE", "/v1/income-entries/abc", tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
}

func TestListIncomeEntriesHTTP(t *testing.T) {
	a := newTestAPI(t)
	job, side := a.createIncomeSource(tokMember, "Job"), a.createIncomeSource(tokMember, "Side gig")
	for _, d := range []string{"2025-12-31", "2026-01-01", "2026-01-31", "2026-02-01"} {
		a.entryOn(tokMember, job.Id, d)
	}
	a.entryOn(tokMember, side.Id, "2026-01-15")

	all := a.listIncomeEntries(tokMember, "")
	if got := entryDates(all); got != "2026-02-01,2026-01-31,2026-01-15,2026-01-01,2025-12-31" {
		t.Fatalf("all = %s", got)
	}
	if all.NextCursor != nil {
		t.Fatalf("next_cursor = %v on the only page", *all.NextCursor)
	}
	for q, want := range map[string]string{
		"?month=2026-01": "2026-01-31,2026-01-15,2026-01-01",
		"?month=2025-12": "2025-12-31",
		"?month=2026-03": "",
		"?month=2026-01&income_source_id=" + side.Id: "2026-01-15",
		"?income_source_id=" + job.Id:                "2026-02-01,2026-01-31,2026-01-01,2025-12-31",
		"?income_source_id=abc":                      "",
		"?from=2026-01-15&to=2026-02-01":             "2026-02-01,2026-01-31,2026-01-15",
		"?confirmed=false":                           "",
	} {
		if got := entryDates(a.listIncomeEntries(tokMember, q)); got != want {
			t.Errorf("%s = %s, want %s", q, got, want)
		}
	}

	// The body always has next_cursor, null on the last page.
	rec := a.call("GET", "/v1/income-entries?month=2026-03", tokMember, "")
	var raw map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatal(err)
	}
	if v, ok := raw["next_cursor"]; !ok || v != nil {
		t.Fatalf("empty list body = %s", rec.Body)
	}
	if items, ok := raw["items"].([]any); !ok || len(items) != 0 {
		t.Fatalf("empty list items = %s", rec.Body)
	}

	// Pagination walks every entry once, newest first.
	var dates []string
	q := "?limit=2"
	for pages := 0; ; pages++ {
		if pages > 3 {
			t.Fatal("too many pages")
		}
		l := a.listIncomeEntries(tokMember, q)
		dates = append(dates, entryDates(l))
		if l.NextCursor == nil {
			break
		}
		q = "?limit=2&cursor=" + *l.NextCursor
	}
	if got := strings.Join(dates, "|"); got != "2026-02-01,2026-01-31|2026-01-15,2026-01-01|2025-12-31" {
		t.Fatalf("pages = %s", got)
	}

	for _, q := range []string{
		"?month=2026-01&from=2026-01-01",
		"?month=2026-1",
		"?from=2026-02-01&to=2026-01-01",
		"?from=2026-02-30",
		"?limit=0",
		"?limit=1001",
		"?limit=abc",
		"?cursor=bogus",
		"?confirmed=maybe",
	} {
		wantError(t, a.call("GET", "/v1/income-entries"+q, tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	}
}

func TestIncomeEntriesTenancyHTTP(t *testing.T) {
	a := newTestAPI(t)
	adminJob := a.createIncomeSource(tokAdmin, "Job")
	memberJob := a.createIncomeSource(tokMember, "Job")
	adminEntry := a.entryOn(tokAdmin, adminJob.Id, "2026-01-15")
	a.entryOn(tokMember, memberJob.Id, "2026-01-15")
	path := "/v1/income-entries/" + adminEntry["id"].(string)

	// The member cannot see, edit or delete the admin's entry.
	wantError(t, a.call("GET", path, tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("PATCH", path, tokMember, `{"net_cents":1}`), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("DELETE", path, tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	// Nor file an entry under the admin's source.
	wantError(t, a.call("POST", "/v1/income-entries", tokMember, `{"income_source_id":"`+adminJob.Id+
		`","date":"2026-01-01","gross_cents":1,"gross_taxable_cents":1,"net_cents":1}`),
		http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)

	for _, q := range []string{"", "?month=2026-01", "?income_source_id=" + adminJob.Id} {
		for _, e := range a.listIncomeEntries(tokMember, q).Items {
			if e["id"] == adminEntry["id"] {
				t.Fatalf("member's list %q has the admin's entry", q)
			}
		}
	}
	if l := a.listIncomeEntries(tokMember, ""); len(l.Items) != 1 {
		t.Fatalf("member sees %d entries", len(l.Items))
	}
	// The admin's entry is untouched.
	if l := a.listIncomeEntries(tokAdmin, ""); len(l.Items) != 1 || l.Items[0]["net_cents"] != 7000.0 {
		t.Fatalf("admin's entries = %v", l.Items)
	}
}

func TestIncomeEntriesNeedAuth(t *testing.T) {
	a := newTestAPI(t)
	for _, r := range [][2]string{
		{"GET", "/v1/income-entries"},
		{"POST", "/v1/income-entries"},
		{"GET", "/v1/income-entries/1"},
		{"PATCH", "/v1/income-entries/1"},
		{"DELETE", "/v1/income-entries/1"},
	} {
		wantError(t, a.call(r[0], r[1], "", "{}"), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
		wantError(t, a.call(r[0], r[1], tokStray, "{}"), http.StatusForbidden, api.ErrorErrorCodeNotAllowlisted)
	}
}

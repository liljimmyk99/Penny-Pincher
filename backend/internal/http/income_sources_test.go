package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

func (a *testAPI) incomeSources(token string) []api.IncomeSource {
	a.t.Helper()
	rec := a.call("GET", "/v1/income-sources", token, "")
	if rec.Code != http.StatusOK {
		a.t.Fatalf("list status = %d (%s)", rec.Code, rec.Body)
	}
	var body struct{ Items []api.IncomeSource }
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		a.t.Fatal(err)
	}
	return body.Items
}

func (a *testAPI) incomeSource(token, name string) api.IncomeSource {
	a.t.Helper()
	for _, s := range a.incomeSources(token) {
		if s.Name == name {
			return s
		}
	}
	a.t.Fatalf("no income source %q", name)
	return api.IncomeSource{}
}

func (a *testAPI) createIncomeSource(token, name string) api.IncomeSource {
	a.t.Helper()
	rec := a.call("POST", "/v1/income-sources", token, `{"name":"`+name+`"}`)
	if rec.Code != http.StatusCreated {
		a.t.Fatalf("create status = %d (%s)", rec.Code, rec.Body)
	}
	var s api.IncomeSource
	if err := json.Unmarshal(rec.Body.Bytes(), &s); err != nil {
		a.t.Fatal(err)
	}
	return s
}

// addIncomeEntry inserts an entry for the member directly; the entries API is
// a separate endpoint.
func (a *testAPI) addIncomeEntry(sourceID string) {
	a.t.Helper()
	if _, err := a.db.Exec(`INSERT INTO income_entries (user_id, income_source_id, received_on, gross_cents, gross_taxable_cents, net_cents)
		SELECT id, ?, '2026-02-01', 5000, 5000, 4000 FROM users WHERE firebase_uid = 'uid-member'`, sourceID); err != nil {
		a.t.Fatal(err)
	}
}

func TestListIncomeSourcesHTTP(t *testing.T) {
	a := newTestAPI(t)
	rec := a.call("GET", "/v1/income-sources", tokMember, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body struct{ Items []map[string]any }
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != 1 {
		t.Fatalf("items = %v", body.Items)
	}
	other := body.Items[0]
	if other["name"] != "Other" || other["is_protected"] != true || other["has_entries"] != false {
		t.Fatalf("seeded = %v", other)
	}
	for _, k := range []string{"id", "name", "is_protected", "has_entries", "sort_order", "created_at", "updated_at"} {
		if _, ok := other[k]; !ok {
			t.Errorf("missing %q in %v", k, other)
		}
	}
	if _, ok := other["id"].(string); !ok {
		t.Fatalf("id is not a string: %#v", other["id"])
	}
}

func TestCreateIncomeSourceHTTP(t *testing.T) {
	a := newTestAPI(t)
	rec := a.call("POST", "/v1/income-sources", tokMember, `{"name":" Main job "}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var s api.IncomeSource
	json.Unmarshal(rec.Body.Bytes(), &s)
	if s.Name != "Main job" || *s.IsProtected || *s.HasEntries {
		t.Fatalf("created = %+v", s)
	}
	if got := a.incomeSources(tokMember); len(got) != 2 || got[0].Name != "Main job" || got[1].Name != "Other" {
		t.Fatalf("list = %+v", got)
	}

	wantError(t, a.call("POST", "/v1/income-sources", tokMember, `{"name":"main JOB"}`), http.StatusConflict, api.ErrorErrorCodeNameTaken)
	wantError(t, a.call("POST", "/v1/income-sources", tokMember, `{"name":"other"}`), http.StatusConflict, api.ErrorErrorCodeNameTaken)
	wantError(t, a.call("POST", "/v1/income-sources", tokMember, `{"name":"  "}`), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("POST", "/v1/income-sources", tokMember, `{"name":`), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)

	// The admin's list is unaffected; the same name is free for them.
	if got := a.incomeSources(tokAdmin); len(got) != 1 {
		t.Fatalf("member's source visible to admin: %+v", got)
	}
	a.createIncomeSource(tokAdmin, "Main job")
}

func TestRenameIncomeSourceHTTP(t *testing.T) {
	a := newTestAPI(t)
	job := a.createIncomeSource(tokMember, "Job")
	a.createIncomeSource(tokMember, "Gig")
	a.addIncomeEntry(job.Id)
	path := "/v1/income-sources/" + job.Id

	// A source with entries can be renamed.
	rec := a.call("PATCH", path, tokMember, `{"name":"Employer"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var s api.IncomeSource
	json.Unmarshal(rec.Body.Bytes(), &s)
	if s.Name != "Employer" || s.Id != job.Id || !*s.HasEntries {
		t.Fatalf("renamed = %+v", s)
	}

	wantError(t, a.call("PATCH", path, tokMember, `{"name":"GIG"}`), http.StatusConflict, api.ErrorErrorCodeNameTaken)
	wantError(t, a.call("PATCH", path, tokMember, `{"name":""}`), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("PATCH", path, tokMember, `{}`), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("PATCH", "/v1/income-sources/9999", tokMember, `{"name":"X"}`), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("PATCH", "/v1/income-sources/abc", tokMember, `{"name":"X"}`), http.StatusNotFound, api.ErrorErrorCodeNotFound)
}

func TestOtherIncomeSourceProtectedHTTP(t *testing.T) {
	a := newTestAPI(t)
	other := a.incomeSource(tokMember, "Other")
	path := "/v1/income-sources/" + other.Id
	for _, body := range []string{`{"name":"Misc"}`, `{"name":"Other"}`} {
		wantError(t, a.call("PATCH", path, tokMember, body), http.StatusConflict, api.ErrorErrorCodeProtectedResource)
	}
	wantError(t, a.call("DELETE", path, tokMember, ""), http.StatusConflict, api.ErrorErrorCodeProtectedResource)
	if got := a.incomeSource(tokMember, "Other"); got.Id != other.Id {
		t.Fatalf("Other = %+v", got)
	}
}

func TestReorderIncomeSourcesHTTP(t *testing.T) {
	a := newTestAPI(t)
	job := a.createIncomeSource(tokMember, "Job")
	other := a.incomeSource(tokMember, "Other")
	adminOther := a.incomeSource(tokAdmin, "Other")

	rec := a.call("PUT", "/v1/income-sources/order", tokMember, `{"ids":["`+other.Id+`","`+job.Id+`"]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var body struct{ Items []api.IncomeSource }
	json.Unmarshal(rec.Body.Bytes(), &body)
	if len(body.Items) != 2 || body.Items[0].Name != "Other" || body.Items[1].Name != "Job" {
		t.Fatalf("reordered = %s", rec.Body)
	}

	for _, bad := range []string{
		`{"ids":["` + job.Id + `"]}`,                         // missing one
		`{"ids":["` + job.Id + `","` + job.Id + `"]}`,        // repeated
		`{"ids":["` + job.Id + `","abc"]}`,                   // not an id
		`{"ids":["` + job.Id + `","` + adminOther.Id + `"]}`, // another user's
		`{"ids":[]}`,
		`{}`,
	} {
		wantError(t, a.call("PUT", "/v1/income-sources/order", tokMember, bad), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	}
	if got := a.incomeSources(tokMember); got[0].Name != "Other" {
		t.Fatal("rejected reorder changed the order")
	}
}

func TestDeleteIncomeSourceHTTP(t *testing.T) {
	a := newTestAPI(t)
	job, gig := a.createIncomeSource(tokMember, "Job"), a.createIncomeSource(tokMember, "Gig")
	other := a.incomeSource(tokMember, "Other")
	if _, err := a.db.Exec(`INSERT INTO template_income_items (template_id, user_id, income_source_id, day_of_month, gross_cents, gross_taxable_cents, net_cents)
		SELECT t.id, t.user_id, ?, 1, 100, 100, 80 FROM templates t JOIN users u ON u.id = t.user_id WHERE u.firebase_uid = 'uid-member'`, gig.Id); err != nil {
		t.Fatal(err)
	}

	// With entries: rejected, with a message that suggests renaming.
	a.addIncomeEntry(job.Id)
	rec := a.call("DELETE", "/v1/income-sources/"+job.Id, tokMember, "")
	wantError(t, rec, http.StatusConflict, api.ErrorErrorCodeSourceHasEntries)
	var e api.Error
	json.Unmarshal(rec.Body.Bytes(), &e)
	if !strings.Contains(e.Error.Message, "Rename it instead") {
		t.Fatalf("message = %q", e.Error.Message)
	}

	// Without entries: deleted, its template items move to Other.
	rec = a.call("DELETE", "/v1/income-sources/"+gig.Id, tokMember, "")
	if rec.Code != http.StatusNoContent || rec.Body.Len() != 0 {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var src string
	a.db.QueryRow(`SELECT i.income_source_id FROM template_income_items i JOIN users u ON u.id = i.user_id WHERE u.firebase_uid = 'uid-member'`).Scan(&src)
	if src != other.Id {
		t.Fatalf("template item source = %s, want Other (%s)", src, other.Id)
	}
	if got := a.incomeSources(tokMember); len(got) != 2 {
		t.Fatalf("sources = %+v", got)
	}
	wantError(t, a.call("DELETE", "/v1/income-sources/"+gig.Id, tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("DELETE", "/v1/income-sources/abc", tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
}

func TestIncomeSourcesTenancyHTTP(t *testing.T) {
	a := newTestAPI(t)
	adminJob := a.createIncomeSource(tokAdmin, "Job")
	adminOther := a.incomeSource(tokAdmin, "Other")
	for _, id := range []string{adminJob.Id, adminOther.Id} {
		wantError(t, a.call("PATCH", "/v1/income-sources/"+id, tokMember, `{"name":"Mine"}`), http.StatusNotFound, api.ErrorErrorCodeNotFound)
		wantError(t, a.call("DELETE", "/v1/income-sources/"+id, tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	}
	for _, s := range a.incomeSources(tokMember) {
		if s.Id == adminJob.Id || s.Id == adminOther.Id {
			t.Fatal("admin's source listed for member")
		}
	}
	if got := a.incomeSources(tokAdmin); len(got) != 2 || got[0].Name != "Job" {
		t.Fatalf("admin's sources changed: %+v", got)
	}
}

func TestIncomeSourcesNeedAuth(t *testing.T) {
	a := newTestAPI(t)
	wantError(t, a.call("GET", "/v1/income-sources", "", ""), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
	wantError(t, a.call("POST", "/v1/income-sources", tokStray, `{"name":"X"}`), http.StatusForbidden, api.ErrorErrorCodeNotAllowlisted)
}

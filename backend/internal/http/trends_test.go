package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

func TestCustomTrendHTTP(t *testing.T) {
	a := newTestAPI(t)
	a.createExpense(tokMember, a.expenseBody(tokMember, "2026-01-05", 1234, "Shop"))
	a.createExpense(tokMember, a.expenseBody(tokMember, "2026-03-05", 100, "Shop"))
	a.createExpense(tokAdmin, a.expenseBody(tokAdmin, "2026-01-05", 99999, "Shop"))
	cat := a.category(tokMember, "Food").Id

	rec := a.call("GET", "/v1/trends/custom?category_id="+cat+"&from=2026-01-01&to=2026-03-31", tokMember, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var got api.CustomTrend
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.GroupBy != "month" || len(got.Buckets) != 3 || got.Buckets[0].TotalCents != 1234 ||
		got.Buckets[1].Count != 0 || got.Buckets[2].Period != "2026-03" {
		t.Errorf("trend = %+v", got)
	}

	rec = a.call("GET", "/v1/trends/custom?text=none&from=2025-01-01&to=2026-12-31&group_by=year", tokMember, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("year status = %d (%s)", rec.Code, rec.Body)
	}

	wantError(t, a.call("GET", "/v1/trends/custom?from=2026-01-01&to=2026-03-31", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("GET", "/v1/trends/custom?category_id="+cat+"&from=2026-01-01", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("GET", "/v1/trends/custom?category_id="+cat+"&from=2026-04-01&to=2026-03-31", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("GET", "/v1/trends/custom?category_id="+cat+"&from=2026-01-01&to=2026-03-31", "", ""), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
}

func TestSavedTrendsHTTP(t *testing.T) {
	a := newTestAPI(t)
	cat := a.category(tokMember, "Food").Id
	body := fmt.Sprintf(`{"name":"Eating","match_type":"category","category_id":%q,"measure":"amount"}`, cat)

	rec := a.call("POST", "/v1/saved-trends", tokMember, body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create = %d (%s)", rec.Code, rec.Body)
	}
	var st api.SavedTrend
	json.Unmarshal(rec.Body.Bytes(), &st)
	if st.MatchType != "category" || st.CategoryId.MustGet() != cat || !st.MerchantId.IsNull() || !st.MatchText.IsNull() {
		t.Errorf("created = %+v", st)
	}
	wantError(t, a.call("POST", "/v1/saved-trends", tokMember, body), http.StatusConflict, api.ErrorErrorCodeNameTaken)
	wantError(t, a.call("POST", "/v1/saved-trends", tokMember, `{"name":"x","match_type":"note","measure":"count"}`), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)

	path := "/v1/saved-trends/" + st.Id
	if rec := a.call("GET", path, tokMember, ""); rec.Code != http.StatusOK {
		t.Errorf("get = %d", rec.Code)
	}
	rec = a.call("PATCH", path, tokMember, `{"match_type":"note","match_text":"tea","category_id":null,"measure":"count"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch = %d (%s)", rec.Code, rec.Body)
	}
	json.Unmarshal(rec.Body.Bytes(), &st)
	if st.MatchType != "note" || st.MatchText.MustGet() != "tea" || !st.CategoryId.IsNull() || st.Measure != "count" {
		t.Errorf("patched = %+v", st)
	}
	wantError(t, a.call("PATCH", path, tokMember, `{"match_type":"category"}`), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)

	rec = a.call("GET", "/v1/saved-trends", tokMember, "")
	var list struct{ Items []api.SavedTrend }
	json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list.Items) != 1 {
		t.Errorf("list = %+v", list)
	}

	// Another user sees nothing of it.
	wantError(t, a.call("GET", path, tokAdmin, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("PATCH", path, tokAdmin, `{"name":"x"}`), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("DELETE", path, tokAdmin, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("POST", "/v1/saved-trends", tokAdmin, body), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("GET", "/v1/saved-trends/abc", tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)

	if rec := a.call("DELETE", path, tokMember, ""); rec.Code != http.StatusNoContent {
		t.Errorf("delete = %d", rec.Code)
	}
	wantError(t, a.call("GET", path, tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("GET", "/v1/saved-trends", "", ""), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
}

func TestCategoryTrendsHTTP(t *testing.T) {
	a := newTestAPI(t)
	a.createExpense(tokMember, a.expenseBody(tokMember, "2025-12-05", 1234, "Shop"))
	a.createExpense(tokMember, a.expenseBody(tokMember, "2026-01-05", 100, "Shop"))
	a.createExpense(tokAdmin, a.expenseBody(tokAdmin, "2026-01-05", 99999, "Shop"))

	rec := a.call("GET", "/v1/trends/by-category?year=2026", tokMember, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var got api.CategoryTrends
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Year != 2026 || len(got.Categories) == 0 || len(got.AllSpending.ThisYearCents) != 12 ||
		got.AllSpending.ThisYearCents[0] != 100 || got.AllSpending.LastYearCents[11] != 1234 {
		t.Errorf("trends = %+v", got.AllSpending)
	}
	if got.AllSpending.CategoryId.IsSpecified() && !got.AllSpending.CategoryId.IsNull() {
		t.Error("all spending category_id should be null")
	}

	wantError(t, a.call("GET", "/v1/trends/by-category?year=1900", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("GET", "/v1/trends/by-category?year=2026", "", ""), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
}

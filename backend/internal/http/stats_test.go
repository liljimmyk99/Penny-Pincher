package http

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

func TestCategoryStatsHTTP(t *testing.T) {
	a := newTestAPI(t)
	a.createExpense(tokMember, a.expenseBody(tokMember, "2026-02-01", 1234, "Shop"))
	a.createExpense(tokMember, a.expenseBody(tokMember, "2025-02-01", 100, "Shop"))
	a.createExpense(tokAdmin, a.expenseBody(tokAdmin, "2026-02-01", 999, "Shop"))

	rec := a.call("GET", "/v1/categories/stats?year=2026", tokMember, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var body struct{ Items []api.CategoryStats }
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	cats := a.categories(tokMember)
	if len(body.Items) != len(cats) {
		t.Fatalf("items = %d, want %d", len(body.Items), len(cats))
	}
	food := a.category(tokMember, "Food")
	for i, st := range body.Items {
		if st.CategoryId != cats[i].Id {
			t.Fatalf("item %d = %s, want %s (sort order)", i, st.CategoryId, cats[i].Id)
		}
		if st.CategoryId == food.Id && (st.EntryCount != 2 || st.TotalCents != 1334 || st.YearTotalCents != 1234) {
			t.Errorf("food = %+v", st)
		}
	}

	wantError(t, a.call("GET", "/v1/categories/stats?year=1999", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("GET", "/v1/categories/stats", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("GET", "/v1/categories/stats?year=2026", "", ""), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
}

func TestIncomeSourceStatsHTTP(t *testing.T) {
	a := newTestAPI(t)
	job := a.createIncomeSource(tokMember, "Job")
	a.entryOn(tokMember, job.Id, "2026-03-01")
	a.entryOn(tokMember, job.Id, "2025-03-01")
	a.entryOn(tokAdmin, a.incomeSource(tokAdmin, "Other").Id, "2026-03-01")

	rec := a.call("GET", "/v1/income-sources/stats?year=2026", tokMember, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var body struct{ Items []api.IncomeSourceStats }
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != 2 {
		t.Fatalf("items = %+v", body.Items)
	}
	want := api.IncomeSourceStats{IncomeSourceId: job.Id, EntryCount: 2, YearGrossCents: 10000, YearGrossTaxableCents: 9000, YearNetCents: 7000}
	if body.Items[0] != want {
		t.Errorf("job = %+v, want %+v", body.Items[0], want)
	}
	if other := body.Items[1]; other.EntryCount != 0 || other.YearNetCents != 0 {
		t.Errorf("other = %+v, want zero-filled (admin's entry must not leak)", other)
	}
	wantError(t, a.call("GET", "/v1/income-sources/stats?year=2101", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
}

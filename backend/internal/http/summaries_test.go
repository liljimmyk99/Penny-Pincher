package http

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

func TestMonthlySummaryHTTP(t *testing.T) {
	a := newTestAPI(t)
	a.createExpense(tokMember, a.expenseBody(tokMember, "2026-03-01", 1234, "Shop"))
	a.createExpense(tokAdmin, a.expenseBody(tokAdmin, "2026-03-01", 999, "Shop"))

	rec := a.call("GET", "/v1/summaries/monthly/2026-03", tokMember, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var got api.MonthlySummary
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Month != "2026-03" || got.Spending.TotalCents != 1234 || got.IsEmpty || len(got.Income.Sources) != 1 {
		t.Errorf("summary = %+v", got)
	}
	if got.TemplateApplies == nil {
		t.Error("template_applies must be an array")
	}
	saving := 0
	for _, c := range got.Spending.Categories {
		if c.IsSaving {
			saving++
		}
	}
	if saving != 1 {
		t.Errorf("is_saving categories = %d", saving)
	}

	wantError(t, a.call("GET", "/v1/summaries/monthly/2026-13", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("GET", "/v1/summaries/monthly/2026-03", "", ""), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
}

func TestYearlySummaryHTTP(t *testing.T) {
	a := newTestAPI(t)
	a.createExpense(tokMember, a.expenseBody(tokMember, "2026-03-01", 1234, "Shop"))

	rec := a.call("GET", "/v1/summaries/yearly/2026", tokMember, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var got api.YearlySummary
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Year != 2026 || len(got.Months) != 12 || got.AverageMonthCount != 1 || got.Totals.SpentCents != 1234 {
		t.Errorf("summary = %+v", got)
	}

	wantError(t, a.call("GET", "/v1/summaries/yearly/1999", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("GET", "/v1/summaries/yearly/2026", "", ""), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
}

package http

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

type undoResult struct {
	RemovedExpenseCount     int `json:"removed_expense_count"`
	RemovedIncomeEntryCount int `json:"removed_income_entry_count"`
}

func TestApplyTemplateHTTP(t *testing.T) {
	a := newTestAPI(t)
	tm := a.createTemplate(tokMember, "Month")
	housing := a.category(tokMember, "Housing")
	job := a.createIncomeSource(tokMember, "Job")
	base := "/v1/templates/" + tm.Id
	decode[api.TemplateExpenseItem](t, a.call("POST", base+"/expense-items", tokMember,
		`{"category_id":"`+housing.Id+`","merchant_name":"Landlord","day_of_month":31,"amount_cents":120000}`), http.StatusCreated)
	decode[api.TemplateIncomeItem](t, a.call("POST", base+"/income-items", tokMember,
		`{"income_source_id":"`+job.Id+`","day_of_month":30,"gross_cents":300000,"gross_taxable_cents":280000,"net_cents":210000}`),
		http.StatusCreated)

	body := `{"template_id":"` + tm.Id + `"}`
	r := decode[api.TemplateApplyResult](t, a.call("POST", "/v1/months/2028-02/apply-template", tokMember, body), http.StatusCreated)
	if r.Month != "2028-02" || r.TemplateId.MustGet() != tm.Id || r.TemplateName.MustGet() != "Month" ||
		*r.CreatedExpenseCount != 1 || *r.CreatedIncomeEntryCount != 1 || *r.UnconfirmedCount != 2 ||
		r.RemovedExpenseCount != 0 || r.AppliedAt == nil {
		t.Fatalf("apply = %+v", r)
	}
	xs, _ := a.listExpenses(tokMember, "?month=2028-02")
	if len(xs) != 1 || xs[0].Date.String() != "2028-02-29" || xs[0].Confirmed || xs[0].TemplateApplyId.MustGet() != r.Id {
		t.Fatalf("expenses = %+v", xs)
	}

	// A month with data needs reset_month.
	wantError(t, a.call("POST", "/v1/months/2028-02/apply-template", tokMember, body), http.StatusConflict, api.ErrorErrorCodeMonthNotEmpty)
	r2 := decode[api.TemplateApplyResult](t, a.call("POST", "/v1/months/2028-02/apply-template", tokMember,
		`{"template_id":"`+tm.Id+`","reset_month":true}`), http.StatusCreated)
	if r2.RemovedExpenseCount != 1 || r2.RemovedIncomeEntryCount != 1 || *r2.CreatedExpenseCount != 1 {
		t.Fatalf("reset apply = %+v", r2)
	}

	list := decode[struct{ Items []api.TemplateApply }](t, a.call("GET", "/v1/template-applies?month=2028-02", tokMember, ""), http.StatusOK)
	if len(list.Items) != 1 || list.Items[0].Id != r2.Id {
		t.Fatalf("applies = %+v", list)
	}

	// Undo, then undo again (removes nothing).
	u := decode[undoResult](t, a.call("POST", "/v1/template-applies/"+r2.Id+"/undo", tokMember, ""), http.StatusOK)
	if u.RemovedExpenseCount != 1 || u.RemovedIncomeEntryCount != 1 {
		t.Fatalf("undo = %+v", u)
	}
	u = decode[undoResult](t, a.call("POST", "/v1/template-applies/"+r2.Id+"/undo", tokMember, ""), http.StatusOK)
	if u.RemovedExpenseCount != 0 || u.RemovedIncomeEntryCount != 0 {
		t.Fatalf("second undo = %+v", u)
	}

	// Errors.
	wantError(t, a.call("POST", "/v1/months/2028-13/apply-template", tokMember, body), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("POST", "/v1/months/2028-03/apply-template", tokMember, `{"template_id":"999999"}`),
		http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("POST", "/v1/months/2028-03/apply-template", tokMember, `{"template_id":"abc"}`),
		http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("POST", "/v1/template-applies/999999/undo", tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("GET", "/v1/template-applies?month=bad", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)

	// Tenancy: the admin user cannot use the member's template or apply.
	wantError(t, a.call("POST", "/v1/months/2028-03/apply-template", tokAdmin, body), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("POST", "/v1/template-applies/"+r2.Id+"/undo", tokAdmin, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	other := decode[struct{ Items []api.TemplateApply }](t, a.call("GET", "/v1/template-applies?month=2028-02", tokAdmin, ""), http.StatusOK)
	if len(other.Items) != 0 {
		t.Fatalf("admin sees applies = %+v", other)
	}
}

func TestConfirmAllAndSaveMonthHTTP(t *testing.T) {
	a := newTestAPI(t)
	tm := a.createTemplate(tokMember, "Month")
	food := a.category(tokMember, "Food")
	decode[api.TemplateExpenseItem](t, a.call("POST", "/v1/templates/"+tm.Id+"/expense-items", tokMember,
		`{"category_id":"`+food.Id+`","merchant_name":"Grocer","day_of_month":5,"amount_cents":2500}`), http.StatusCreated)
	decode[api.TemplateApplyResult](t, a.call("POST", "/v1/months/2026-08/apply-template", tokMember,
		`{"template_id":"`+tm.Id+`"}`), http.StatusCreated)
	orig := a.createExpense(tokMember, a.expenseBody(tokMember, "2026-08-09", 4000, "Shop"))
	a.createExpense(tokMember, `{"date":"2026-08-12","amount_cents":-1000,"category_id":"`+food.Id+
		`","merchant_name":"Shop","refunded_expense_id":"`+orig.Id+`"}`)

	type confirmResult struct {
		ConfirmedExpenseCount     int `json:"confirmed_expense_count"`
		ConfirmedIncomeEntryCount int `json:"confirmed_income_entry_count"`
	}
	c := decode[confirmResult](t, a.call("POST", "/v1/months/2026-08/confirm-all", tokMember, ""), http.StatusOK)
	if c.ConfirmedExpenseCount != 1 || c.ConfirmedIncomeEntryCount != 0 {
		t.Fatalf("confirm all = %+v", c)
	}
	wantError(t, a.call("POST", "/v1/months/2026-8/confirm-all", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)

	saved := decode[api.Template](t, a.call("POST", "/v1/months/2026-08/save-as-template", tokMember, `{"name":"August"}`), http.StatusCreated)
	if saved.Name != "August" || len(saved.ExpenseItems) != 2 || len(saved.IncomeItems) != 0 ||
		saved.ExpenseItems[0].DayOfMonth != 5 || saved.ExpenseItems[1].DayOfMonth != 9 {
		t.Fatalf("saved = %+v", saved)
	}
	// Empty lists are [] in JSON.
	var m map[string]any
	raw := a.call("POST", "/v1/months/2026-01/save-as-template", tokMember, `{"name":"Empty"}`).Body.Bytes()
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	if _, ok := m["income_items"].([]any); !ok {
		t.Fatalf("income_items = %v", m["income_items"])
	}
	wantError(t, a.call("POST", "/v1/months/2026-08/save-as-template", tokMember, `{"name":"august"}`),
		http.StatusConflict, api.ErrorErrorCodeNameTaken)
	wantError(t, a.call("POST", "/v1/months/2026-08/save-as-template", tokMember, `{"name":" "}`),
		http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("POST", "/v1/months/x/save-as-template", tokMember, `{"name":"X"}`),
		http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)

	// The admin user's August is their own (empty).
	adminSaved := decode[api.Template](t, a.call("POST", "/v1/months/2026-08/save-as-template", tokAdmin, `{"name":"August"}`), http.StatusCreated)
	if len(adminSaved.ExpenseItems) != 0 {
		t.Fatalf("admin saved = %+v", adminSaved)
	}
}

func TestMonthActionsNeedAuth(t *testing.T) {
	a := newTestAPI(t)
	for _, c := range []struct{ method, path string }{
		{"POST", "/v1/months/2026-01/apply-template"},
		{"POST", "/v1/months/2026-01/confirm-all"},
		{"POST", "/v1/months/2026-01/save-as-template"},
		{"GET", "/v1/template-applies?month=2026-01"},
		{"POST", "/v1/template-applies/1/undo"},
	} {
		if rec := a.call(c.method, c.path, "", ""); rec.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s = %d", c.method, c.path, rec.Code)
		}
		if rec := a.call(c.method, c.path, tokStray, ""); rec.Code != http.StatusForbidden {
			t.Fatalf("%s %s stray = %d", c.method, c.path, rec.Code)
		}
	}
}

package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"testing"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

// expenseBody is a create body in the token's "Food" category.
func (a *testAPI) expenseBody(token, date string, cents int64, merchant string) string {
	a.t.Helper()
	return fmt.Sprintf(`{"date":%q,"amount_cents":%d,"category_id":%q,"merchant_name":%q}`,
		date, cents, a.category(token, "Food").Id, merchant)
}

func (a *testAPI) createExpense(token, body string) api.Expense {
	a.t.Helper()
	rec := a.call("POST", "/v1/expenses", token, body)
	if rec.Code != http.StatusCreated {
		a.t.Fatalf("create status = %d (%s)", rec.Code, rec.Body)
	}
	var e api.Expense
	if err := json.Unmarshal(rec.Body.Bytes(), &e); err != nil {
		a.t.Fatal(err)
	}
	return e
}

func (a *testAPI) listExpenses(token, query string) ([]api.Expense, *string) {
	a.t.Helper()
	rec := a.call("GET", "/v1/expenses"+query, token, "")
	if rec.Code != http.StatusOK {
		a.t.Fatalf("list status = %d (%s)", rec.Code, rec.Body)
	}
	var body struct {
		Items      []api.Expense
		NextCursor *string `json:"next_cursor"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		a.t.Fatal(err)
	}
	return body.Items, body.NextCursor
}

func TestCreateExpenseHTTP(t *testing.T) {
	a := newTestAPI(t)
	food := a.category(tokMember, "Food").Id
	rec := a.call("POST", "/v1/expenses", tokMember,
		`{"date":"2026-03-14","amount_cents":1250,"category_id":"`+food+`","merchant_name":"Corner Cafe","note":"lunch"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var raw map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"id", "date", "amount_cents", "type", "category_id", "merchant", "note",
		"refunded_expense_id", "refunded_total_cents", "confirmed", "template_apply_id", "import_id", "created_at", "updated_at"} {
		if _, ok := raw[k]; !ok {
			t.Errorf("missing %q in %s", k, rec.Body)
		}
	}
	mer, _ := raw["merchant"].(map[string]any)
	if raw["date"] != "2026-03-14" || raw["amount_cents"] != 1250.0 || raw["type"] != "expense" ||
		raw["category_id"] != food || mer["name"] != "Corner Cafe" || mer["id"] == "" || raw["note"] != "lunch" ||
		raw["refunded_expense_id"] != nil || raw["refunded_total_cents"] != 0.0 || raw["confirmed"] != true ||
		raw["template_apply_id"] != nil {
		t.Fatalf("body = %s", rec.Body)
	}

	// The same merchant in another case is the same merchant; a refund is typed.
	ref := a.createExpense(tokMember, a.expenseBody(tokMember, "2026-03-15", -300, "corner CAFE"))
	if ref.Merchant.Id != mer["id"] || ref.Merchant.Name != "Corner Cafe" || *ref.Type != api.ExpenseTypeRefund {
		t.Fatalf("refund = %+v", ref)
	}

	// Get returns the same expense.
	id := raw["id"].(string)
	rec = a.call("GET", "/v1/expenses/"+id, tokMember, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("get status = %d (%s)", rec.Code, rec.Body)
	}
}

func TestCreateExpenseValidationHTTP(t *testing.T) {
	a := newTestAPI(t)
	food := a.category(tokMember, "Food").Id
	for _, c := range []struct{ body, field string }{
		{`{"date":"2026-03-14","amount_cents":0,"category_id":"` + food + `","merchant_name":"Shop"}`, "amount_cents"},
		{`{"amount_cents":100,"category_id":"` + food + `","merchant_name":"Shop"}`, "date"},
		{`{"date":"2026-03-14","amount_cents":100,"category_id":"nope","merchant_name":"Shop"}`, "category_id"},
		{`{"date":"2026-03-14","amount_cents":100,"category_id":"` + a.category(tokAdmin, "Food").Id + `","merchant_name":"Shop"}`, "category_id"},
		{`{"date":"2026-03-14","amount_cents":100,"category_id":"` + food + `","merchant_name":" "}`, "merchant_name"},
	} {
		rec := a.call("POST", "/v1/expenses", tokMember, c.body)
		wantError(t, rec, http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
		var e api.Error
		_ = json.Unmarshal(rec.Body.Bytes(), &e)
		if e.Error.Details == nil || (*e.Error.Details)[0].Field != c.field {
			t.Errorf("%s: body = %s, want field %s", c.body, rec.Body, c.field)
		}
	}
	wantError(t, a.call("POST", "/v1/expenses", tokMember, `{"date":"2026-02-30"}`),
		http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
}

func TestCreateExpensesBatchHTTP(t *testing.T) {
	a := newTestAPI(t)
	one := a.expenseBody(tokMember, "2026-03-01", 100, "New Merchant")
	two := a.expenseBody(tokMember, "2026-03-02", 200, "Shop")
	bad := a.expenseBody(tokMember, "2026-03-03", 0, "Shop")

	rec := a.call("POST", "/v1/expenses/batch", tokMember, `{"items":[`+one+`,`+bad+`,`+two+`]}`)
	wantError(t, rec, http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	var e api.Error
	_ = json.Unmarshal(rec.Body.Bytes(), &e)
	if e.Error.Details == nil || (*e.Error.Details)[0].Field != "items[1].amount_cents" {
		t.Fatalf("body = %s", rec.Body)
	}
	if items, _ := a.listExpenses(tokMember, ""); len(items) != 0 {
		t.Fatalf("saved %d expenses from a failed batch", len(items))
	}
	if rec := a.call("GET", "/v1/merchants", tokMember, ""); rec.Code != http.StatusOK || rec.Body.String() != "{\"items\":[],\"next_cursor\":null}\n" {
		t.Fatalf("merchants after failed batch = %s", rec.Body)
	}

	link := `{"date":"2026-03-03","amount_cents":-5,"category_id":"` + a.category(tokMember, "Food").Id +
		`","merchant_name":"Shop","refunded_expense_id":"999"}`
	rec = a.call("POST", "/v1/expenses/batch", tokMember, `{"items":[`+one+`,`+link+`]}`)
	wantError(t, rec, http.StatusBadRequest, api.ErrorErrorCodeInvalidRefundLink)
	_ = json.Unmarshal(rec.Body.Bytes(), &e)
	if e.Error.Details == nil || (*e.Error.Details)[0].Field != "items[1].refunded_expense_id" {
		t.Fatalf("body = %s", rec.Body)
	}

	wantError(t, a.call("POST", "/v1/expenses/batch", tokMember, `{"items":[]}`),
		http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)

	rec = a.call("POST", "/v1/expenses/batch", tokMember, `{"items":[`+one+`,`+two+`]}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var out struct{ Items []api.Expense }
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Items) != 2 || out.Items[0].Merchant.Name != "New Merchant" || out.Items[1].AmountCents != 200 {
		t.Fatalf("batch = %+v", out.Items)
	}
}

func TestUpdateAndDeleteExpenseHTTP(t *testing.T) {
	a := newTestAPI(t)
	exp := a.createExpense(tokMember, a.expenseBody(tokMember, "2026-03-01", 1000, "Shop"))

	rec := a.call("PATCH", "/v1/expenses/"+exp.Id, tokMember, `{"merchant_name":"Bakery","note":"gift"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var got api.Expense
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Merchant.Name != "Bakery" || got.Note.MustGet() != "gift" || got.AmountCents != 1000 {
		t.Fatalf("updated = %+v", got)
	}
	rec = a.call("PATCH", "/v1/expenses/"+exp.Id, tokMember, `{"note":null}`)
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if rec.Code != http.StatusOK || !got.Note.IsNull() {
		t.Fatalf("clear note = %d %s", rec.Code, rec.Body)
	}
	wantError(t, a.call("PATCH", "/v1/expenses/"+exp.Id, tokMember, `{}`),
		http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)

	// A refund pointing at it blocks a negative amount.
	ref := a.createExpense(tokMember, `{"date":"2026-04-01","amount_cents":-100,"category_id":"`+exp.CategoryId+
		`","merchant_name":"Shop","refunded_expense_id":"`+exp.Id+`"}`)
	wantError(t, a.call("PATCH", "/v1/expenses/"+exp.Id, tokMember, `{"amount_cents":-1000}`),
		http.StatusConflict, api.ErrorErrorCodeHasLinkedRefunds)
	rec = a.call("GET", "/v1/expenses/"+exp.Id, tokMember, "")
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if *got.RefundedTotalCents != -100 || got.LastRefundDate.MustGet().String() != "2026-04-01" {
		t.Fatalf("refunded_total_cents = %d, last_refund_date = %v", *got.RefundedTotalCents, got.LastRefundDate)
	}
	wantError(t, a.call("PATCH", "/v1/expenses/"+ref.Id, tokMember, `{"refunded_expense_id":"`+ref.Id+`"}`),
		http.StatusBadRequest, api.ErrorErrorCodeInvalidRefundLink)

	if rec := a.call("DELETE", "/v1/expenses/"+exp.Id, tokMember, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d (%s)", rec.Code, rec.Body)
	}
	wantError(t, a.call("GET", "/v1/expenses/"+exp.Id, tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	rec = a.call("GET", "/v1/expenses/"+ref.Id, tokMember, "")
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if rec.Code != http.StatusOK || !got.RefundedExpenseId.IsNull() {
		t.Fatalf("refund after delete = %s", rec.Body)
	}
}

func TestListExpensesHTTP(t *testing.T) {
	a := newTestAPI(t)
	a.createExpense(tokMember, a.expenseBody(tokMember, "2026-02-28", 100, "Shop"))
	mar := a.createExpense(tokMember, a.expenseBody(tokMember, "2026-03-01", 200, "Shop"))
	a.createExpense(tokMember, a.expenseBody(tokMember, "2026-03-02", -50, "Bakery"))

	items, next := a.listExpenses(tokMember, "?month=2026-03")
	if len(items) != 2 || items[0].Date.String() != "2026-03-02" || next != nil {
		t.Fatalf("month = %+v, next %v", items, next)
	}
	items, _ = a.listExpenses(tokMember, "?type=refund")
	if len(items) != 1 || items[0].AmountCents != -50 {
		t.Fatalf("refunds = %+v", items)
	}
	items, _ = a.listExpenses(tokMember, "?merchant_id="+mar.Merchant.Id+"&from=2026-03-01")
	if len(items) != 1 || items[0].Id != mar.Id {
		t.Fatalf("merchant filter = %+v", items)
	}

	// Pages: limit 2 then the rest.
	items, next = a.listExpenses(tokMember, "?limit=2")
	if len(items) != 2 || next == nil {
		t.Fatalf("page 1 = %d, next %v", len(items), next)
	}
	items, next = a.listExpenses(tokMember, "?limit=2&cursor="+url.QueryEscape(*next))
	if len(items) != 1 || next != nil || items[0].Date.String() != "2026-02-28" {
		t.Fatalf("page 2 = %+v, next %v", items, next)
	}

	for _, q := range []string{"?month=2026-03&from=2026-03-01", "?month=2026-3", "?limit=0", "?cursor=zz!", "?type=income"} {
		wantError(t, a.call("GET", "/v1/expenses"+q, tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	}
}

func TestExpensesTenancyHTTP(t *testing.T) {
	a := newTestAPI(t)
	exp := a.createExpense(tokMember, a.expenseBody(tokMember, "2026-03-01", 100, "Shop"))

	wantError(t, a.call("GET", "/v1/expenses/"+exp.Id, tokAdmin, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("PATCH", "/v1/expenses/"+exp.Id, tokAdmin, `{"amount_cents":1}`), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("DELETE", "/v1/expenses/"+exp.Id, tokAdmin, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	if items, _ := a.listExpenses(tokAdmin, ""); len(items) != 0 {
		t.Fatalf("admin sees %d of the member's expenses", len(items))
	}
	if rec := a.call("GET", "/v1/merchants?q=sh", tokAdmin, ""); rec.Body.String() != "{\"items\":[],\"next_cursor\":null}\n" {
		t.Fatalf("admin merchants = %s", rec.Body)
	}
	link := `{"date":"2026-03-02","amount_cents":-5,"category_id":"` + a.category(tokAdmin, "Food").Id +
		`","merchant_name":"Shop","refunded_expense_id":"` + exp.Id + `"}`
	wantError(t, a.call("POST", "/v1/expenses", tokAdmin, link), http.StatusBadRequest, api.ErrorErrorCodeInvalidRefundLink)

	// The member's expense is untouched.
	rec := a.call("GET", "/v1/expenses/"+exp.Id, tokMember, "")
	var got api.Expense
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if rec.Code != http.StatusOK || got.AmountCents != 100 {
		t.Fatalf("member's expense = %s", rec.Body)
	}
}

func TestListMerchantsHTTP(t *testing.T) {
	a := newTestAPI(t)
	for _, m := range []string{"Corner Cafe", "corn market", "Bakery"} {
		a.createExpense(tokMember, a.expenseBody(tokMember, "2026-03-01", 100, m))
	}
	rec := a.call("GET", "/v1/merchants?q=CORN", tokMember, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	var body struct {
		Items      []api.Merchant
		NextCursor *string `json:"next_cursor"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if len(body.Items) != 2 || body.Items[0].Name != "corn market" || body.Items[1].Name != "Corner Cafe" || body.NextCursor != nil {
		t.Fatalf("autocomplete = %s", rec.Body)
	}
	rec = a.call("GET", "/v1/merchants?limit=1", tokMember, "")
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if len(body.Items) != 1 || body.Items[0].Name != "Bakery" || body.NextCursor == nil {
		t.Fatalf("page = %s", rec.Body)
	}
	wantError(t, a.call("GET", "/v1/merchants?cursor=!!", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
}

func TestExpensesNeedAuth(t *testing.T) {
	a := newTestAPI(t)
	for _, r := range [][2]string{{"GET", "/v1/expenses"}, {"POST", "/v1/expenses/batch"}, {"GET", "/v1/merchants"}} {
		wantError(t, a.call(r[0], r[1], "", ""), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
		wantError(t, a.call(r[0], r[1], tokStray, ""), http.StatusForbidden, api.ErrorErrorCodeNotAllowlisted)
	}
}

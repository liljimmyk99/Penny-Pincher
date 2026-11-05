package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

// decode fails the test unless rec has status want, then decodes its body.
func decode[T any](t *testing.T, rec interface {
	Result() *http.Response
}, want int) T {
	t.Helper()
	res := rec.Result()
	defer res.Body.Close()
	var v T
	if res.StatusCode != want {
		t.Fatalf("status = %d, want %d", res.StatusCode, want)
	}
	if want != http.StatusNoContent {
		if err := json.NewDecoder(res.Body).Decode(&v); err != nil {
			t.Fatal(err)
		}
	}
	return v
}

func (a *testAPI) createTemplate(token, name string) api.Template {
	a.t.Helper()
	return decode[api.Template](a.t, a.call("POST", "/v1/templates", token, fmt.Sprintf(`{"name":%q}`, name)), http.StatusCreated)
}

func (a *testAPI) getTemplate(token, id string) api.Template {
	a.t.Helper()
	return decode[api.Template](a.t, a.call("GET", "/v1/templates/"+id, token, ""), http.StatusOK)
}

func TestTemplateCRUDHTTP(t *testing.T) {
	a := newTestAPI(t)

	list := decode[struct{ Items []api.TemplateSummary }](t, a.call("GET", "/v1/templates", tokMember, ""), http.StatusOK)
	if len(list.Items) != 1 || list.Items[0].Name != "Default" || list.Items[0].ExpenseItemCount != 0 {
		t.Fatalf("seeded list = %+v", list)
	}

	tm := a.createTemplate(tokMember, "Lean month")
	if tm.Name != "Lean month" || tm.ExpenseItems == nil || tm.IncomeItems == nil || tm.CreatedAt == nil {
		t.Fatalf("created = %+v", tm)
	}
	// Empty item lists are [] in JSON, not null.
	raw := a.call("GET", "/v1/templates/"+tm.Id, tokMember, "").Body.String()
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		t.Fatal(err)
	}
	if _, ok := m["expense_items"].([]any); !ok {
		t.Fatalf("expense_items = %v", m["expense_items"])
	}

	wantError(t, a.call("POST", "/v1/templates", tokMember, `{"name":"lean MONTH"}`), http.StatusConflict, api.ErrorErrorCodeNameTaken)
	wantError(t, a.call("POST", "/v1/templates", tokMember, `{"name":"  "}`), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)

	renamed := decode[api.Template](t, a.call("PATCH", "/v1/templates/"+tm.Id, tokMember, `{"name":"Quiet month"}`), http.StatusOK)
	if renamed.Name != "Quiet month" {
		t.Fatalf("renamed = %+v", renamed)
	}
	wantError(t, a.call("PATCH", "/v1/templates/"+tm.Id, tokMember, `{"name":"default"}`), http.StatusConflict, api.ErrorErrorCodeNameTaken)
	wantError(t, a.call("PATCH", "/v1/templates/abc", tokMember, `{"name":"X"}`), http.StatusNotFound, api.ErrorErrorCodeNotFound)

	list = decode[struct{ Items []api.TemplateSummary }](t, a.call("GET", "/v1/templates", tokMember, ""), http.StatusOK)
	if len(list.Items) != 2 || list.Items[0].Name != "Default" || list.Items[1].Name != "Quiet month" {
		t.Fatalf("list = %+v", list)
	}

	decode[struct{}](t, a.call("DELETE", "/v1/templates/"+tm.Id, tokMember, ""), http.StatusNoContent)
	wantError(t, a.call("GET", "/v1/templates/"+tm.Id, tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("DELETE", "/v1/templates/"+tm.Id, tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("GET", "/v1/templates/abc", tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
}

func TestTemplateItemsHTTP(t *testing.T) {
	a := newTestAPI(t)
	tm := a.createTemplate(tokMember, "Month")
	housing, food := a.category(tokMember, "Housing"), a.category(tokMember, "Food")
	job := a.createIncomeSource(tokMember, "Job")
	base := "/v1/templates/" + tm.Id

	exp := decode[api.TemplateExpenseItem](t, a.call("POST", base+"/expense-items", tokMember,
		`{"category_id":"`+housing.Id+`","merchant_name":"Landlord","day_of_month":31,"amount_cents":120000,"note":"rent"}`),
		http.StatusCreated)
	if exp.CategoryId != housing.Id || exp.Merchant.Name != "Landlord" || exp.DayOfMonth != 31 ||
		exp.AmountCents != 120000 || exp.Note.MustGet() != "rent" {
		t.Fatalf("expense item = %+v", exp)
	}
	inc := decode[api.TemplateIncomeItem](t, a.call("POST", base+"/income-items", tokMember,
		`{"income_source_id":"`+job.Id+`","day_of_month":15,"gross_cents":300000,"gross_taxable_cents":280000,"net_cents":210000}`),
		http.StatusCreated)
	if inc.IncomeSourceId != job.Id || inc.DayOfMonth != 15 || inc.NetCents != 210000 || !inc.Note.IsNull() {
		t.Fatalf("income item = %+v", inc)
	}

	got := a.getTemplate(tokMember, tm.Id)
	if len(got.ExpenseItems) != 1 || got.ExpenseItems[0].Id != exp.Id || len(got.IncomeItems) != 1 || got.IncomeItems[0].Id != inc.Id {
		t.Fatalf("template = %+v", got)
	}

	upExp := decode[api.TemplateExpenseItem](t, a.call("PATCH", base+"/expense-items/"+exp.Id, tokMember,
		`{"category_id":"`+food.Id+`","day_of_month":1,"note":null}`), http.StatusOK)
	if upExp.CategoryId != food.Id || upExp.DayOfMonth != 1 || !upExp.Note.IsNull() || upExp.AmountCents != 120000 {
		t.Fatalf("updated expense item = %+v", upExp)
	}
	upInc := decode[api.TemplateIncomeItem](t, a.call("PATCH", base+"/income-items/"+inc.Id, tokMember,
		`{"net_cents":200000,"note":"after raise"}`), http.StatusOK)
	if upInc.NetCents != 200000 || upInc.Note.MustGet() != "after raise" || upInc.DayOfMonth != 15 {
		t.Fatalf("updated income item = %+v", upInc)
	}
	wantError(t, a.call("PATCH", base+"/income-items/"+inc.Id, tokMember, `{"net_cents":999999}`),
		http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("POST", base+"/expense-items", tokMember,
		`{"category_id":"999999","merchant_name":"X","day_of_month":1,"amount_cents":1}`),
		http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)

	decode[struct{}](t, a.call("DELETE", base+"/expense-items/"+exp.Id, tokMember, ""), http.StatusNoContent)
	decode[struct{}](t, a.call("DELETE", base+"/income-items/"+inc.Id, tokMember, ""), http.StatusNoContent)
	wantError(t, a.call("DELETE", base+"/expense-items/"+exp.Id, tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("PATCH", base+"/income-items/"+inc.Id, tokMember, `{"day_of_month":2}`), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("POST", "/v1/templates/999999/expense-items", tokMember,
		`{"category_id":"`+food.Id+`","merchant_name":"X","day_of_month":1,"amount_cents":1}`),
		http.StatusNotFound, api.ErrorErrorCodeNotFound)
	if got := a.getTemplate(tokMember, tm.Id); len(got.ExpenseItems) != 0 || len(got.IncomeItems) != 0 {
		t.Fatalf("items left = %+v", got)
	}
}

func TestTemplateItemDayOfMonthHTTP(t *testing.T) {
	a := newTestAPI(t)
	tm := a.createTemplate(tokMember, "Month")
	food := a.category(tokMember, "Food")
	other := a.incomeSource(tokMember, "Other")
	base := "/v1/templates/" + tm.Id

	expBody := func(day int) string {
		return fmt.Sprintf(`{"category_id":%q,"merchant_name":"X","day_of_month":%d,"amount_cents":1}`, food.Id, day)
	}
	incBody := func(day int) string {
		return fmt.Sprintf(`{"income_source_id":%q,"day_of_month":%d,"gross_cents":0,"gross_taxable_cents":0,"net_cents":0}`, other.Id, day)
	}
	for _, day := range []int{0, 32} {
		wantError(t, a.call("POST", base+"/expense-items", tokMember, expBody(day)), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
		wantError(t, a.call("POST", base+"/income-items", tokMember, incBody(day)), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	}
	exp := decode[api.TemplateExpenseItem](t, a.call("POST", base+"/expense-items", tokMember, expBody(31)), http.StatusCreated)
	inc := decode[api.TemplateIncomeItem](t, a.call("POST", base+"/income-items", tokMember, incBody(1)), http.StatusCreated)
	wantError(t, a.call("PATCH", base+"/expense-items/"+exp.Id, tokMember, `{"day_of_month":32}`), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("PATCH", base+"/income-items/"+inc.Id, tokMember, `{"day_of_month":0}`), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
}

func TestTemplateTenancyHTTP(t *testing.T) {
	a := newTestAPI(t)
	tm := a.createTemplate(tokMember, "Mine")
	base := "/v1/templates/" + tm.Id
	exp := decode[api.TemplateExpenseItem](t, a.call("POST", base+"/expense-items", tokMember,
		`{"category_id":"`+a.category(tokMember, "Food").Id+`","merchant_name":"X","day_of_month":1,"amount_cents":1}`),
		http.StatusCreated)
	inc := decode[api.TemplateIncomeItem](t, a.call("POST", base+"/income-items", tokMember,
		`{"income_source_id":"`+a.incomeSource(tokMember, "Other").Id+`","day_of_month":1,"gross_cents":0,"gross_taxable_cents":0,"net_cents":0}`),
		http.StatusCreated)

	// The admin is another user here: they see none of the member's templates.
	list := decode[struct{ Items []api.TemplateSummary }](t, a.call("GET", "/v1/templates", tokAdmin, ""), http.StatusOK)
	for _, s := range list.Items {
		if s.Id == tm.Id {
			t.Fatal("admin sees member's template")
		}
	}
	adminFood := a.category(tokAdmin, "Food").Id
	for _, r := range [][3]string{
		{"GET", base, ""},
		{"PATCH", base, `{"name":"Taken"}`},
		{"DELETE", base, ""},
		{"POST", base + "/expense-items", `{"category_id":"` + adminFood + `","merchant_name":"X","day_of_month":1,"amount_cents":1}`},
		{"POST", base + "/income-items", `{"income_source_id":"` + a.incomeSource(tokAdmin, "Other").Id + `","day_of_month":1,"gross_cents":0,"gross_taxable_cents":0,"net_cents":0}`},
		{"PATCH", base + "/expense-items/" + exp.Id, `{"day_of_month":2}`},
		{"PATCH", base + "/income-items/" + inc.Id, `{"day_of_month":2}`},
		{"DELETE", base + "/expense-items/" + exp.Id, ""},
		{"DELETE", base + "/income-items/" + inc.Id, ""},
	} {
		wantError(t, a.call(r[0], r[1], tokAdmin, r[2]), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	}
	// The admin's own template cannot use the member's category.
	own := a.createTemplate(tokAdmin, "Admin month")
	wantError(t, a.call("POST", "/v1/templates/"+own.Id+"/expense-items", tokAdmin,
		`{"category_id":"`+a.category(tokMember, "Food").Id+`","merchant_name":"X","day_of_month":1,"amount_cents":1}`),
		http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)

	got := a.getTemplate(tokMember, tm.Id)
	if got.Name != "Mine" || len(got.ExpenseItems) != 1 || len(got.IncomeItems) != 1 || got.ExpenseItems[0].DayOfMonth != 1 {
		t.Fatalf("member's template changed: %+v", got)
	}
}

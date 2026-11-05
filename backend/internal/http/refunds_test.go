package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

// refundBody is a create body for a refund in the token's "Food" category,
// linked to orig when it is not empty.
func (a *testAPI) refundBody(token, date string, cents int64, orig string) string {
	a.t.Helper()
	link := "null"
	if orig != "" {
		link = fmt.Sprintf("%q", orig)
	}
	return fmt.Sprintf(`{"date":%q,"amount_cents":%d,"category_id":%q,"merchant_name":"Shop","refunded_expense_id":%s}`,
		date, cents, a.category(token, "Food").Id, link)
}

func (a *testAPI) getExpense(token, id string) api.Expense {
	a.t.Helper()
	rec := a.call("GET", "/v1/expenses/"+id, token, "")
	if rec.Code != http.StatusOK {
		a.t.Fatalf("get status = %d (%s)", rec.Code, rec.Body)
	}
	var e api.Expense
	if err := json.Unmarshal(rec.Body.Bytes(), &e); err != nil {
		a.t.Fatal(err)
	}
	return e
}

func TestRefundLinkingHTTP(t *testing.T) {
	a := newTestAPI(t)
	orig := a.createExpense(tokMember, a.expenseBody(tokMember, "2025-12-20", 6000, "Shop"))
	r1 := a.createExpense(tokMember, a.refundBody(tokMember, "2026-01-03", -1000, orig.Id))
	r2 := a.createExpense(tokMember, a.refundBody(tokMember, "2026-02-04", -1500, orig.Id))

	// Partial refunds: the original shows their sum; each refund its link.
	if got := a.getExpense(tokMember, orig.Id); *got.RefundedTotalCents != -2500 || got.AmountCents != 6000 {
		t.Fatalf("original = %+v", got)
	}
	if r1.RefundedExpenseId.MustGet() != orig.Id || *r1.RefundedTotalCents != 0 || *r1.Type != api.ExpenseTypeRefund {
		t.Fatalf("refund = %+v", r1)
	}

	// Each refund is listed in the month of its own date.
	for month, want := range map[string]string{"2025-12": orig.Id, "2026-01": r1.Id, "2026-02": r2.Id} {
		items, _ := a.listExpenses(tokMember, "?month="+month)
		if len(items) != 1 || items[0].Id != want {
			t.Errorf("month %s = %+v, want only %s", month, items, want)
		}
	}

	// Links to another user's expense or to a refund are rejected, on create
	// and on update.
	theirs := a.createExpense(tokAdmin, a.expenseBody(tokAdmin, "2026-01-01", 100, "Shop"))
	for _, to := range []string{theirs.Id, r1.Id} {
		wantError(t, a.call("POST", "/v1/expenses", tokMember, a.refundBody(tokMember, "2026-01-05", -5, to)),
			http.StatusBadRequest, api.ErrorErrorCodeInvalidRefundLink)
		wantError(t, a.call("PATCH", "/v1/expenses/"+r2.Id, tokMember, `{"refunded_expense_id":"`+to+`"}`),
			http.StatusBadRequest, api.ErrorErrorCodeInvalidRefundLink)
	}
	if got := a.getExpense(tokMember, r2.Id); got.RefundedExpenseId.MustGet() != orig.Id {
		t.Fatalf("refund after rejected links = %+v", got)
	}

	// Linking an existing refund by PATCH.
	loose := a.createExpense(tokMember, a.refundBody(tokMember, "2026-03-01", -500, ""))
	rec := a.call("PATCH", "/v1/expenses/"+loose.Id, tokMember, `{"refunded_expense_id":"`+orig.Id+`"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("link status = %d (%s)", rec.Code, rec.Body)
	}
	if got := a.getExpense(tokMember, orig.Id); *got.RefundedTotalCents != -3000 {
		t.Fatalf("refunded total after link = %d", *got.RefundedTotalCents)
	}

	// Deleting the original unlinks every refund and keeps them in their months.
	if rec := a.call("DELETE", "/v1/expenses/"+orig.Id, tokMember, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d (%s)", rec.Code, rec.Body)
	}
	for _, r := range []api.Expense{r1, r2, loose} {
		got := a.getExpense(tokMember, r.Id)
		if !got.RefundedExpenseId.IsNull() || got.AmountCents != r.AmountCents || got.Date != r.Date {
			t.Errorf("refund after delete = %+v", got)
		}
	}
	if items, _ := a.listExpenses(tokMember, "?month=2026-02"); len(items) != 1 || items[0].Id != r2.Id {
		t.Errorf("Feb after delete = %+v", items)
	}
}

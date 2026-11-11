package http

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/xuri/excelize/v2"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

func (a *testAPI) exportFixture() {
	a.t.Helper()
	orig := a.createExpense(tokMember, a.expenseBody(tokMember, "2026-03-05", 1234, "Shop"))
	a.createExpense(tokMember, `{"date":"2026-04-02","amount_cents":-234,"category_id":"`+a.category(tokMember, "Food").Id+
		`","merchant_name":"Shop","refunded_expense_id":"`+orig.Id+`"}`)
	a.createExpense(tokMember, `{"date":"2026-05-01","amount_cents":500,"category_id":"`+a.category(tokMember, "Food").Id+
		`","merchant_name":"=HYPERLINK(\"http://x\")","note":"@cmd"}`)
	job := a.createIncomeSource(tokMember, "Job")
	a.entryOn(tokMember, job.Id, "2026-03-31")
	// Another user's rows must never appear.
	a.createExpense(tokAdmin, a.expenseBody(tokAdmin, "2026-03-06", 99999, "Other Shop"))
	a.entryOn(tokAdmin, a.createIncomeSource(tokAdmin, "Secret").Id, "2026-03-31")
}

func readCSVZip(t *testing.T, body []byte) map[string][][]string {
	t.Helper()
	zr, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		t.Fatal(err)
	}
	out := map[string][][]string{}
	for _, f := range zr.File {
		rc, _ := f.Open()
		b, _ := io.ReadAll(rc)
		rc.Close()
		rows, err := csv.NewReader(bytes.NewReader(b)).ReadAll()
		if err != nil {
			t.Fatal(err)
		}
		out[f.Name] = rows
	}
	return out
}

func TestExportCSVHTTP(t *testing.T) {
	a := newTestAPI(t)
	a.exportFixture()

	rec := a.call("GET", "/v1/export?format=csv", tokMember, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/zip" {
		t.Errorf("content type = %q", ct)
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, ".zip") {
		t.Errorf("content disposition = %q", cd)
	}
	files := readCSVZip(t, rec.Body.Bytes())
	exp, inc := files["expenses.csv"], files["income.csv"]
	if len(exp) != 4 || len(inc) != 2 {
		t.Fatalf("rows: expenses %d income %d", len(exp), len(inc))
	}
	if exp[0][4] != "Amount (cents)" || exp[0][5] != "Amount (formatted dollars)" {
		t.Errorf("headers = %v", exp[0])
	}
	// Integer cents and a labelled formatted column, refund negative and linked.
	if exp[1][4] != "1234" || exp[1][5] != "12.34" || exp[1][6] != "expense" {
		t.Errorf("expense row = %v", exp[1])
	}
	if exp[2][4] != "-234" || exp[2][5] != "-2.34" || exp[2][6] != "refund" || exp[2][8] == "" {
		t.Errorf("refund row = %v", exp[2])
	}
	// Formula injection is neutralised in user-entered text.
	if !strings.HasPrefix(exp[3][3], "'=") || exp[3][7] != "'@cmd" {
		t.Errorf("unescaped cells = %q %q", exp[3][3], exp[3][7])
	}
	if inc[1][2] != "Job" || inc[1][3] != "10000" || inc[1][4] != "9000" || inc[1][5] != "7000" || inc[1][6] != "100.00" {
		t.Errorf("income row = %v", inc[1])
	}
	for _, rows := range files {
		for _, r := range rows {
			for _, c := range r {
				if strings.Contains(c, "Other Shop") || c == "Secret" || c == "99999" {
					t.Errorf("another user's data leaked: %q", c)
				}
			}
		}
	}
}

func TestExportXLSXHTTP(t *testing.T) {
	a := newTestAPI(t)
	a.exportFixture()

	rec := a.call("GET", "/v1/export?format=xlsx", tokMember, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "spreadsheetml.sheet") {
		t.Errorf("content type = %q", ct)
	}
	f, err := excelize.OpenReader(bytes.NewReader(rec.Body.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	exp, _ := f.GetRows("Expenses")
	inc, _ := f.GetRows("Income")
	if len(exp) != 4 || len(inc) != 2 {
		t.Fatalf("rows: expenses %d income %d", len(exp), len(inc))
	}
	if exp[1][4] != "1234" || exp[1][5] != "12.34" || exp[2][4] != "-234" {
		t.Errorf("rows = %v %v", exp[1], exp[2])
	}
	if typ, _ := f.GetCellType("Expenses", "E2"); typ != excelize.CellTypeNumber && typ != excelize.CellTypeUnset { // no t attribute means numeric
		t.Errorf("cents cell type = %v, want number", typ)
	}
	if !strings.HasPrefix(exp[3][3], "'=") {
		t.Errorf("merchant cell = %q", exp[3][3])
	}
	if inc[1][2] != "Job" || inc[1][3] != "10000" {
		t.Errorf("income row = %v", inc[1])
	}
}

func TestExportRangeAndValidationHTTP(t *testing.T) {
	a := newTestAPI(t)
	a.exportFixture()

	rec := a.call("GET", "/v1/export?format=csv&from=2026-04-01&to=2026-04-30", tokMember, "")
	files := readCSVZip(t, rec.Body.Bytes())
	if len(files["expenses.csv"]) != 2 || len(files["income.csv"]) != 1 {
		t.Errorf("rows: expenses %d income %d (header + the April refund only)", len(files["expenses.csv"]), len(files["income.csv"]))
	}

	wantError(t, a.call("GET", "/v1/export?format=csv&from=2026-05-01&to=2026-04-01", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("GET", "/v1/export?format=pdf", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("GET", "/v1/export", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("GET", "/v1/export?format=csv", "", ""), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
	wantError(t, a.call("GET", "/v1/export?format=csv", tokStray, ""), http.StatusForbidden, api.ErrorErrorCodeNotAllowlisted)
}

func TestFormatCents(t *testing.T) {
	for in, want := range map[int64]string{0: "0.00", 5: "0.05", 100: "1.00", -234: "-2.34", 123456789: "1234567.89", -5: "-0.05"} {
		if got := formatCents(in); got != want {
			t.Errorf("formatCents(%d) = %q, want %q", in, got, want)
		}
	}
}

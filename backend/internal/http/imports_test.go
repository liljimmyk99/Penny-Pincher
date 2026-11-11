package http

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/xuri/excelize/v2"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/imports"
)

// upload posts data as the multipart "file" field.
func (a *testAPI) upload(token, name string, data []byte) *httptest.ResponseRecorder {
	a.t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, err := mw.CreateFormFile("file", name)
	if err != nil {
		a.t.Fatal(err)
	}
	_, _ = fw.Write(data)
	_ = mw.Close()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/v1/imports", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	a.h.ServeHTTP(rec, req)
	return rec
}

func (a *testAPI) uploadOK(token, name string, data []byte) api.Import {
	a.t.Helper()
	rec := a.upload(token, name, data)
	if rec.Code != http.StatusCreated {
		a.t.Fatalf("upload status = %d (%s)", rec.Code, rec.Body)
	}
	var imp api.Import
	if err := json.Unmarshal(rec.Body.Bytes(), &imp); err != nil {
		a.t.Fatal(err)
	}
	return imp
}

// xlsx builds a workbook with the template's headers and the given rows.
func xlsx(t *testing.T, expenses, income [][]any) []byte {
	t.Helper()
	f := excelize.NewFile()
	defer f.Close()
	_ = f.SetSheetName("Sheet1", imports.ExpensesSheet)
	_, _ = f.NewSheet(imports.IncomeSheet)
	fill := func(sheet string, headers []string, rows [][]any) {
		hs := make([]any, len(headers))
		for i, h := range headers {
			hs[i] = h
		}
		_ = f.SetSheetRow(sheet, "A1", &hs)
		for i, r := range rows {
			r := r
			ref, _ := excelize.CoordinatesToCellName(1, i+2)
			_ = f.SetSheetRow(sheet, ref, &r)
		}
	}
	fill(imports.ExpensesSheet, imports.ExpenseHeaders, expenses)
	fill(imports.IncomeSheet, imports.IncomeHeaders, income)
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func (a *testAPI) count(table string) int {
	a.t.Helper()
	var n int
	if err := a.db.QueryRow("SELECT count(*) FROM " + table).Scan(&n); err != nil {
		a.t.Fatal(err)
	}
	return n
}

func TestImportTemplateHTTP(t *testing.T) {
	a := newTestAPI(t)
	if rec := a.call("POST", "/v1/categories", tokMember, `{"name":"Travel"}`); rec.Code != http.StatusCreated {
		t.Fatalf("create category: %d %s", rec.Code, rec.Body)
	}
	a.createIncomeSource(tokMember, "Side job")

	rec := a.call("GET", "/v1/imports/template", tokMember, "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Header().Get("Content-Disposition"), "penny-pincher-import.xlsx") {
		t.Fatalf("status = %d headers = %v", rec.Code, rec.Header())
	}
	f, err := excelize.OpenReader(bytes.NewReader(rec.Body.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	list, _ := f.GetRows("Lists")
	var cats, srcs []string
	for _, r := range list {
		cats = append(cats, r[0])
		if len(r) > 1 {
			srcs = append(srcs, r[1])
		}
	}
	if !contains(cats, "Travel") || !contains(cats, "Food") || !contains(srcs, "Side job") {
		t.Fatalf("lists = %v / %v", cats, srcs)
	}
	// Another user's names are not in this user's template.
	other := a.call("GET", "/v1/imports/template", tokAdmin, "")
	g, _ := excelize.OpenReader(bytes.NewReader(other.Body.Bytes()))
	defer g.Close()
	for _, r := range func() [][]string { l, _ := g.GetRows("Lists"); return l }() {
		if r[0] == "Travel" {
			t.Fatal("template leaked another user's category")
		}
	}

	// Round trip: fill the downloaded template and upload it.
	_ = f.SetSheetRow("Expenses", "A2", &[]any{"2019-03-05", "Travel", "Train", "42.10"})
	_ = f.SetSheetRow("Income", "A2", &[]any{"2019-03-05", "Side job", "100", "90", "70"})
	var buf bytes.Buffer
	_ = f.Write(&buf)
	imp := a.uploadOK(tokMember, "filled.xlsx", buf.Bytes())
	if imp.RowsReady != 2 || imp.RowsWithProblems != 0 || imp.Status != api.ImportStatusReview {
		t.Fatalf("import = %+v", imp)
	}
}

func contains(l []string, s string) bool {
	for _, x := range l {
		if x == s {
			return true
		}
	}
	return false
}

func TestImportTemplateNeedsAuth(t *testing.T) {
	wantError(t, do(t, "GET", "/v1/imports/template", ""), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
}

func TestImportUploadFileErrors(t *testing.T) {
	a := newTestAPI(t)
	for name, data := range map[string][]byte{
		"not xlsx": []byte("Date,Category\n"),
		"no rows":  xlsx(t, nil, nil),
		"bad header": func() []byte {
			f := excelize.NewFile()
			_ = f.SetSheetName("Sheet1", "Expenses")
			_, _ = f.NewSheet("Income")
			var b bytes.Buffer
			_ = f.Write(&b)
			return b.Bytes()
		}(),
	} {
		t.Run(name, func(t *testing.T) {
			wantError(t, a.upload(tokMember, "x.xlsx", data), http.StatusBadRequest, api.ErrorErrorCodeInvalidImportFile)
		})
	}
	if a.count("imports") != 0 {
		t.Fatal("a rejected file must store nothing")
	}

	// No file part at all.
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	_ = mw.WriteField("other", "x")
	_ = mw.Close()
	req := httptest.NewRequest("POST", "/v1/imports", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+tokMember)
	rec := httptest.NewRecorder()
	a.h.ServeHTTP(rec, req)
	wantError(t, rec, http.StatusBadRequest, api.ErrorErrorCodeInvalidImportFile)
}

func TestImportUploadTooLarge(t *testing.T) {
	a := newTestAPI(t)
	// Over the 10 MB file limit but under the body cap: the handler answers.
	wantError(t, a.upload(tokMember, "big.xlsx", make([]byte, 10<<20+1024)),
		http.StatusRequestEntityTooLarge, api.ErrorErrorCodeFileTooLarge)
	// Over the body cap: the edge answers, with the same code.
	wantError(t, a.upload(tokMember, "huge.xlsx", make([]byte, 12<<20)),
		http.StatusRequestEntityTooLarge, api.ErrorErrorCodeFileTooLarge)
}

func TestImportUploadChecksAndStoresNothingElse(t *testing.T) {
	a := newTestAPI(t)
	before := [3]int{a.count("expenses"), a.count("income_entries"), a.count("merchants")}
	imp := a.uploadOK(tokMember, `C:\docs\old history.xlsx`, xlsx(t,
		[][]any{
			{"2019-03-05", "Food", "New Shop", "12.50", "n"},
			{"2019-03-06", "Nope", "New Shop", "5"},
			{"2020-01-02", "Food", "Other Shop", "-3"},
			{"2020-01-03", "Food", "Other Shop", "1.234"},
		},
		[][]any{{"2020-01-31", "Other", "100", "90", "70"}}))
	if after := [3]int{a.count("expenses"), a.count("income_entries"), a.count("merchants")}; after != before {
		t.Fatalf("upload wrote entries or merchants: %v -> %v", before, after)
	}
	if imp.FileName != "old history.xlsx" || imp.ExpenseRows != 4 || imp.IncomeRows != 1 || imp.RowsReady != 3 || imp.RowsWithProblems != 2 {
		t.Fatalf("import = %+v", imp)
	}
	if fm, _ := imp.FirstMonth.Get(); fm != "2019-03" {
		t.Fatalf("first month = %q", fm)
	}
	if len(imp.Years) != 2 || imp.Years[0].Year != 2019 || imp.Years[0].SpentCents != 1250 || imp.Years[0].RowsWithProblems != 1 ||
		imp.Years[1].Year != 2020 || imp.Years[1].SpentCents != -300 || imp.Years[1].IncomeRows != 1 || imp.Years[1].Months != 1 {
		t.Fatalf("years = %+v", imp.Years)
	}
	if len(imp.Issues) != 2 || imp.Issues[0].Code != api.UnknownCategory || imp.Issues[0].Row != 3 ||
		imp.Issues[1].Code != api.TooManyDecimals || imp.Issues[1].Value != "1.234" || imp.IssuesTruncated {
		t.Fatalf("issues = %+v", imp.Issues)
	}
	if imp.MonthsWithExistingEntries == nil || len(imp.MonthsWithExistingEntries) != 0 {
		t.Fatalf("months = %#v", imp.MonthsWithExistingEntries)
	}
	// Same figures from GET and in the history list.
	rec := a.call("GET", "/v1/imports/"+imp.Id, tokMember, "")
	var got api.Import
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if rec.Code != 200 || got.RowsReady != 3 || len(got.Years) != 2 {
		t.Fatalf("get = %d %s", rec.Code, rec.Body)
	}
	rec = a.call("GET", "/v1/imports?status=review", tokMember, "")
	var list struct{ Items []api.ImportSummary }
	_ = json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list.Items) != 1 || list.Items[0].Id != imp.Id {
		t.Fatalf("list = %s", rec.Body)
	}
	wantError(t, a.call("GET", "/v1/imports?status=bogus", tokMember, ""), http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest)
}

func TestImportIssuesCappedAt500(t *testing.T) {
	a := newTestAPI(t)
	rows := make([][]any, 600)
	for i := range rows {
		rows[i] = []any{"2019-03-05", "Nope", "Shop", "1"}
	}
	imp := a.uploadOK(tokMember, "many.xlsx", xlsx(t, rows, nil))
	if len(imp.Issues) != 500 || !imp.IssuesTruncated || imp.RowsWithProblems != 600 {
		t.Fatalf("issues = %d truncated = %v problems = %d", len(imp.Issues), imp.IssuesTruncated, imp.RowsWithProblems)
	}
	// The download has all of them.
	rec := a.call("GET", "/v1/imports/"+imp.Id+"/problems", tokMember, "")
	f, err := excelize.OpenReader(bytes.NewReader(rec.Body.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if r, _ := f.GetRows("Expenses"); len(r) != 601 {
		t.Fatalf("problem rows = %d", len(r)-1)
	}
}

func TestImportMonthsWithExistingEntries(t *testing.T) {
	a := newTestAPI(t)
	a.createExpense(tokMember, a.expenseBody(tokMember, "2019-03-20", 500, "Old Shop"))
	src := a.incomeSource(tokMember, "Other")
	a.entryOn(tokMember, src.Id, "2019-03-01")
	a.createExpense(tokAdmin, a.expenseBody(tokAdmin, "2020-01-05", 500, "Not Mine")) // another user's month

	imp := a.uploadOK(tokMember, "h.xlsx", xlsx(t,
		[][]any{{"2019-03-05", "Food", "Shop", "1"}, {"2019-03-06", "Food", "Shop", "1"}, {"2020-01-05", "Food", "Shop", "1"}}, nil))
	if len(imp.MonthsWithExistingEntries) != 1 {
		t.Fatalf("months = %+v", imp.MonthsWithExistingEntries)
	}
	if m := imp.MonthsWithExistingEntries[0]; m.Month != "2019-03" || m.ExistingEntries != 2 || m.FileEntries != 2 {
		t.Fatalf("month = %+v", m)
	}
}

func TestImportProblemsDownloadAndFixReupload(t *testing.T) {
	a := newTestAPI(t)
	imp := a.uploadOK(tokMember, "my history.xlsx", xlsx(t,
		[][]any{{"2019-03-05", "Food", "Shop", "1"}, {"2019-03-06", "Nope", "Shop", "-5.50", "note"}}, nil))
	rec := a.call("GET", "/v1/imports/"+imp.Id+"/problems", tokMember, "")
	if rec.Code != 200 || !strings.Contains(rec.Header().Get("Content-Disposition"), `filename="my-history-problems.xlsx"`) {
		t.Fatalf("status = %d headers = %v", rec.Code, rec.Header())
	}
	f, _ := excelize.OpenReader(bytes.NewReader(rec.Body.Bytes()))
	defer f.Close()
	rows, _ := f.GetRows("Expenses")
	if len(rows) != 2 || rows[0][5] != "Problem" || rows[1][1] != "Nope" || rows[1][3] != "-5.50" || !strings.Contains(rows[1][5], "Category") {
		t.Fatalf("rows = %v", rows)
	}
	// Fix the category and upload the problems file again.
	_ = f.SetCellValue("Expenses", "B2", "Food")
	var buf bytes.Buffer
	_ = f.Write(&buf)
	again := a.uploadOK(tokMember, "fixed.xlsx", buf.Bytes())
	if again.RowsReady != 1 || again.RowsWithProblems != 0 {
		t.Fatalf("reupload = %+v", again)
	}
}

func TestImportDiscardAndStatus(t *testing.T) {
	a := newTestAPI(t)
	imp := a.uploadOK(tokMember, "h.xlsx", xlsx(t, [][]any{{"2019-03-05", "Food", "Shop", "1"}}, nil))
	if rec := a.call("DELETE", "/v1/imports/"+imp.Id, tokMember, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("discard = %d %s", rec.Code, rec.Body)
	}
	wantError(t, a.call("GET", "/v1/imports/"+imp.Id, tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	if a.count("import_rows") != 0 {
		t.Fatal("discard leaves rows")
	}

	imp = a.uploadOK(tokMember, "h.xlsx", xlsx(t, [][]any{{"2019-03-05", "Food", "Shop", "1"}}, nil))
	if _, err := a.db.Exec(`UPDATE imports SET status = 'completed'`); err != nil {
		t.Fatal(err)
	}
	wantError(t, a.call("DELETE", "/v1/imports/"+imp.Id, tokMember, ""), http.StatusConflict, api.ErrorErrorCodeImportWrongStatus)
	wantError(t, a.call("DELETE", "/v1/imports/nope", tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
}

func TestImportExpiresAfter24Hours(t *testing.T) {
	a := newTestAPI(t)
	imp := a.uploadOK(tokMember, "h.xlsx", xlsx(t, [][]any{{"2019-03-05", "Food", "Shop", "1"}}, nil))
	if _, err := a.db.Exec(`UPDATE imports SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-25 hours')`); err != nil {
		t.Fatal(err)
	}
	rec := a.call("GET", "/v1/imports/"+imp.Id, tokMember, "")
	var got api.Import
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if rec.Code != 200 || got.Status != api.ImportStatusExpired {
		t.Fatalf("get = %d %s", rec.Code, rec.Body)
	}
	wantError(t, a.call("DELETE", "/v1/imports/"+imp.Id, tokMember, ""), http.StatusConflict, api.ErrorErrorCodeImportWrongStatus)
}

func TestImportTenancy(t *testing.T) {
	a := newTestAPI(t)
	imp := a.uploadOK(tokAdmin, "h.xlsx", xlsx(t, [][]any{{"2019-03-05", "Food", "Shop", "1"}}, nil))
	for _, c := range [][2]string{
		{"GET", "/v1/imports/" + imp.Id},
		{"DELETE", "/v1/imports/" + imp.Id},
		{"GET", "/v1/imports/" + imp.Id + "/problems"},
	} {
		wantError(t, a.call(c[0], c[1], tokMember, ""), http.StatusNotFound, api.ErrorErrorCodeNotFound)
	}
	rec := a.call("GET", "/v1/imports", tokMember, "")
	if rec.Code != 200 || strings.Contains(rec.Body.String(), imp.Id) || !strings.Contains(rec.Body.String(), `"items":[]`) {
		t.Fatalf("member list = %s", rec.Body)
	}
	// Still there for its owner.
	if rec := a.call("GET", "/v1/imports/"+imp.Id, tokAdmin, ""); rec.Code != 200 {
		t.Fatalf("owner get = %d", rec.Code)
	}
	// A member's own upload cannot match the admin's category by id or name.
	if _, err := a.db.Exec(`UPDATE categories SET name = 'AdminOnly' WHERE name = 'Housing' AND user_id = (SELECT id FROM users WHERE firebase_uid = 'uid-admin')`); err != nil {
		t.Fatal(err)
	}
	got := a.uploadOK(tokMember, "m.xlsx", xlsx(t, [][]any{{"2019-03-05", "AdminOnly", "Shop", "1"}}, nil))
	if got.RowsWithProblems != 1 || got.Issues[0].Code != api.UnknownCategory {
		t.Fatalf("member import = %+v", got)
	}
}

func TestImportNeverLogsCellValues(t *testing.T) {
	var logs bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	defer slog.SetDefault(old)

	a := newTestAPI(t)
	a.uploadOK(tokMember, "secret-file-name.xlsx", xlsx(t, [][]any{{"2019-03-05", "Food", "SecretMerchant", "777.77", "secretnote"}}, nil))
	a.upload(tokMember, "secret-file-name.xlsx", []byte("SecretMerchant not a workbook"))
	for _, s := range []string{"SecretMerchant", "777.77", "secretnote", "secret-file-name"} {
		if strings.Contains(logs.String(), s) {
			t.Fatalf("log contains %q: %s", s, logs.String())
		}
	}
}

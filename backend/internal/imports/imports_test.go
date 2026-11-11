package imports

import (
	"bytes"
	"errors"
	"strings"
	"testing"

	"github.com/xuri/excelize/v2"

	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

var lookups = Lookups{Categories: []string{"Food", "Other"}, Sources: []string{"Salary", "Other"}}

// workbook builds an upload from raw string rows (below the headers).
func workbook(t *testing.T, expenses, income [][]any) []byte {
	t.Helper()
	f := excelize.NewFile()
	defer f.Close()
	_ = f.SetSheetName("Sheet1", ExpensesSheet)
	_, _ = f.NewSheet(IncomeSheet)
	put := func(sheet string, headers []string, rows [][]any) {
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
	put(ExpensesSheet, ExpenseHeaders, expenses)
	put(IncomeSheet, IncomeHeaders, income)
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func parse(t *testing.T, expenses, income [][]any) Result {
	t.Helper()
	res, err := Parse(workbook(t, expenses, income), lookups)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func codes(res Result) []string {
	var out []string
	for _, is := range res.Issues {
		out = append(out, is.Code)
	}
	return out
}

func TestParseCents(t *testing.T) {
	ok := map[string]int64{
		"12": 1200, "12.5": 1250, "12.50": 1250, "0.1": 10, "0.07": 7, "-12.50": -1250, "+3": 300,
		".5": 50, "5.": 500, "19.00": 1900, "1e2": 10000, "1.2345E+3": 123450,
		"19.989999999999998":  1999, // Excel's double for a typed 19.99
		"0.30000000000000004": 30,
	}
	for in, want := range ok {
		if got, code := ParseCents(in); code != "" || got != want {
			t.Errorf("ParseCents(%q) = %d, %q; want %d", in, got, code, want)
		}
	}
	bad := map[string]string{
		"abc": CodeInvalidNumber, "$12.00": CodeInvalidNumber, "1,200": CodeInvalidNumber, "12.3.4": CodeInvalidNumber,
		"1e999": CodeInvalidNumber, "12.001": CodeTooManyDecimals, "19.999": CodeTooManyDecimals,
		"1234567890123": CodeInvalidNumber, "NaN": CodeInvalidNumber,
	}
	for in, want := range bad {
		if _, code := ParseCents(in); code != want {
			t.Errorf("ParseCents(%q) code = %q, want %q", in, code, want)
		}
	}
}

func TestEveryIssueCode(t *testing.T) {
	long := strings.Repeat("x", 101)
	cases := []struct {
		name    string
		expense []any
		income  []any
		want    string
	}{
		{"unknown category", []any{"2019-03-05", "Nope", "Shop", "5"}, nil, CodeUnknownCategory},
		{"unknown source", nil, []any{"2019-03-05", "Nope", "10", "9", "8"}, CodeUnknownIncomeSource},
		{"bad date", []any{"2019-02-30", "Food", "Shop", "5"}, nil, CodeInvalidDate},
		{"bad date text", []any{"last week", "Food", "Shop", "5"}, nil, CodeInvalidDate},
		{"missing merchant", []any{"2019-03-05", "Food", "", "5"}, nil, CodeMissingValue},
		{"missing amount", []any{"2019-03-05", "Food", "Shop", ""}, nil, CodeMissingValue},
		{"missing taxable", nil, []any{"2019-03-05", "Salary", "10", "", "8"}, CodeMissingValue},
		{"not a number", []any{"2019-03-05", "Food", "Shop", "five"}, nil, CodeInvalidNumber},
		{"three decimals", []any{"2019-03-05", "Food", "Shop", "5.001"}, nil, CodeTooManyDecimals},
		{"zero amount", []any{"2019-03-05", "Food", "Shop", "0.00"}, nil, CodeZeroAmount},
		{"negative income", nil, []any{"2019-03-05", "Salary", "-10", "0", "0"}, CodeNegativeIncome},
		{"taxable over gross", nil, []any{"2019-03-05", "Salary", "10", "11", "8"}, CodeTaxableExceedsGross},
		{"net over gross", nil, []any{"2019-03-05", "Salary", "10", "9", "11"}, CodeNetExceedsGross},
		{"merchant too long", []any{"2019-03-05", "Food", long, "5"}, nil, CodeTextTooLong},
		{"note too long", []any{"2019-03-05", "Food", "Shop", "5", strings.Repeat("n", 501)}, nil, CodeTextTooLong},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var e, i [][]any
			if c.expense != nil {
				e = [][]any{c.expense}
			}
			if c.income != nil {
				i = [][]any{c.income}
			}
			res := parse(t, e, i)
			if len(res.Rows) != 1 || res.Rows[0].Ready {
				t.Fatalf("rows = %+v", res.Rows)
			}
			if got := codes(res); len(got) != 1 || got[0] != c.want {
				t.Fatalf("codes = %v, want [%s]", got, c.want)
			}
			if res.Rows[0].Original == nil {
				t.Fatal("a problem row keeps its original cells")
			}
		})
	}
}

func TestValidRowsAndMatching(t *testing.T) {
	res := parse(t,
		[][]any{
			{"2019-03-05", "food", " Corner Market ", "12.50", "milk"}, // case-insensitive, trimmed
			{"2019-03-06", "OTHER", "Shop", "-3"},                      // refund
			{"", "", "", ""},                                           // blank row skipped
			{45356, "Food", "Shop", 19.99},                             // Excel date serial and number cell
		},
		[][]any{{"2020-01-31", "salary", "2500", "2400.50", "1900"}})
	if len(res.Issues) != 0 || len(res.Rows) != 4 {
		t.Fatalf("issues = %+v rows = %d", res.Issues, len(res.Rows))
	}
	r := res.Rows[0]
	if !r.Ready || *r.Category != "Food" || *r.Merchant != "Corner Market" || *r.Amount != 1250 || *r.Date != "2019-03-05" || *r.Note != "milk" {
		t.Fatalf("row = %+v", r)
	}
	if *res.Rows[1].Amount != -300 || *res.Rows[1].Category != "Other" {
		t.Fatalf("refund = %+v", res.Rows[1])
	}
	if r := res.Rows[2]; r.RowNumber != 5 || *r.Date != "2024-03-05" || *r.Amount != 1999 {
		t.Fatalf("serial row = %+v (%s)", r, *r.Date)
	}
	inc := res.Rows[3]
	if inc.Sheet != store.SheetIncome || *inc.Source != "Salary" || *inc.Gross != 250000 || *inc.Taxable != 240050 || *inc.Net != 190000 {
		t.Fatalf("income = %+v", inc)
	}
}

func TestSeveralIssuesOnOneRow(t *testing.T) {
	res := parse(t, [][]any{{"nope", "Nope", "", "1.234"}}, nil)
	if got := codes(res); len(got) != 4 {
		t.Fatalf("codes = %v", got)
	}
	for _, is := range res.Issues {
		if is.Sheet != store.SheetExpenses || is.RowNumber != 2 || is.Column == "" || is.Message == "" {
			t.Fatalf("issue = %+v", is)
		}
	}
}

func TestFileLevelErrors(t *testing.T) {
	var bad *ErrInvalidFile
	check := func(name string, data []byte) {
		t.Helper()
		if _, err := Parse(data, lookups); !errors.As(err, &bad) {
			t.Errorf("%s: err = %v, want ErrInvalidFile", name, err)
		}
	}
	check("not xlsx", []byte("a,b,c\n1,2,3\n"))
	check("empty", nil)
	check("no data rows", workbook(t, nil, nil))

	f := excelize.NewFile()
	var buf bytes.Buffer
	_ = f.Write(&buf)
	check("missing sheets", buf.Bytes())

	g := excelize.NewFile()
	_ = g.SetSheetName("Sheet1", ExpensesSheet)
	_, _ = g.NewSheet(IncomeSheet)
	_ = g.SetSheetRow(ExpensesSheet, "A1", &[]any{"Date", "Cat", "Merchant", "Amount", "Note"}) // renamed header
	_ = g.SetSheetRow(IncomeSheet, "A1", &[]any{"Date", "Source", "Gross", "Gross taxable", "Net", "Note"})
	buf.Reset()
	_ = g.Write(&buf)
	check("changed header", buf.Bytes())
}

func TestTooManyRows(t *testing.T) {
	f := excelize.NewFile()
	_ = f.SetSheetName("Sheet1", ExpensesSheet)
	_, _ = f.NewSheet(IncomeSheet)
	sw, _ := f.NewStreamWriter(ExpensesSheet)
	_ = sw.SetRow("A1", []any{"Date", "Category", "Merchant", "Amount", "Note"})
	for i := 2; i <= MaxRows+2; i++ {
		ref, _ := excelize.CoordinatesToCellName(1, i)
		_ = sw.SetRow(ref, []any{"2019-03-05", "Food", "Shop", "1"})
	}
	_ = sw.Flush()
	_ = f.SetSheetRow(IncomeSheet, "A1", &[]any{"Date", "Source", "Gross", "Gross taxable", "Net", "Note"})
	var buf bytes.Buffer
	_ = f.Write(&buf)
	var bad *ErrInvalidFile
	if _, err := Parse(buf.Bytes(), lookups); !errors.As(err, &bad) {
		t.Fatalf("err = %v", err)
	}
}

func TestTemplateDropdownsAndRoundTrip(t *testing.T) {
	data, err := Template([]string{"Food", "Other"}, []string{"Salary", "Other"})
	if err != nil {
		t.Fatal(err)
	}
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	names := f.GetSheetList()
	if len(names) != 4 || names[0] != ExpensesSheet || names[1] != IncomeSheet || names[2] != HelpSheet {
		t.Fatalf("sheets = %v", names)
	}
	dv, _ := f.GetDataValidations(ExpensesSheet)
	if len(dv) != 1 || dv[0].Formula1 != "Lists!$A$1:$A$2" {
		t.Fatalf("expense dropdown = %+v", dv)
	}
	dv, _ = f.GetDataValidations(IncomeSheet)
	if len(dv) != 1 || dv[0].Formula1 != "Lists!$B$1:$B$2" {
		t.Fatalf("income dropdown = %+v", dv)
	}
	if v, _ := f.GetSheetVisible("Lists"); v {
		t.Fatal("Lists should be hidden")
	}

	// Fill it in and read it back.
	_ = f.SetSheetRow(ExpensesSheet, "A2", &[]any{"2019-03-05", "Food", "Shop", "4.20"})
	_ = f.SetSheetRow(IncomeSheet, "A2", &[]any{"2019-03-05", "Salary", "100", "90", "70"})
	var buf bytes.Buffer
	_ = f.Write(&buf)
	res, err := Parse(buf.Bytes(), lookups)
	if err != nil || len(res.Rows) != 2 || len(res.Issues) != 0 {
		t.Fatalf("err = %v res = %+v", err, res)
	}
}

func TestProblemsWorkbook(t *testing.T) {
	res := parse(t, [][]any{
		{"2019-03-05", "Food", "Shop", "5"},
		{"2019-03-06", "Nope", "-Shop", "-5.001", "n"},
	}, nil)
	var problems []store.ImportRow
	for _, r := range res.Rows {
		if !r.Ready {
			problems = append(problems, r)
		}
	}
	data, err := Problems(problems, res.Issues)
	if err != nil {
		t.Fatal(err)
	}
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	rows, _ := f.GetRows(ExpensesSheet)
	if len(rows) != 2 || rows[0][5] != ProblemHeader {
		t.Fatalf("rows = %v", rows)
	}
	if rows[1][0] != "2019-03-06" || rows[1][3] != "-5.001" || rows[1][2] != "'-Shop" || rows[1][5] == "" {
		t.Fatalf("problem row = %v", rows[1])
	}
	inc, _ := f.GetRows(IncomeSheet)
	if len(inc) != 1 || inc[0][6] != ProblemHeader {
		t.Fatalf("income = %v", inc)
	}
}

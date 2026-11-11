package imports

import (
	"bytes"
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/xuri/excelize/v2"

	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

// Limits (AGENTS.md §6.14, §10).
const (
	// MaxRows is the most data rows across both sheets.
	MaxRows = 50000
	// maxScanRows stops a file padded with blank rows from being read forever.
	maxScanRows = 4 * MaxRows

	maxMerchantLen = 100
	maxNoteLen     = 500
	maxValueLen    = 200 // longest cell text echoed back in an issue

	// Zip-bomb guards for excelize (docs/security.md).
	unzipSizeLimit    = 100 << 20
	unzipXMLSizeLimit = 20 << 20
)

// ErrInvalidFile: not a usable template file (not an .xlsx, a sheet missing,
// headers changed, no data rows, or too many rows). The message is safe to show.
type ErrInvalidFile struct{ Reason string }

func (e *ErrInvalidFile) Error() string { return e.Reason }

func invalidFile(reason string) error { return &ErrInvalidFile{Reason: reason} }

// Lookups are the user's current names, used to match case-insensitively.
type Lookups struct {
	Categories []string
	Sources    []string
}

// Result is a checked file: every data row (ready or not) and every issue.
type Result struct {
	Rows   []store.ImportRow
	Issues []store.ImportIssue
}

var isoDate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// Parse reads and checks an uploaded template. Nothing is created: unknown
// categories and sources become issues. Cell values are never logged.
func Parse(data []byte, lk Lookups) (Result, error) {
	f, err := excelize.OpenReader(bytes.NewReader(data), excelize.Options{
		UnzipSizeLimit:    unzipSizeLimit,
		UnzipXMLSizeLimit: unzipXMLSizeLimit,
	})
	if err != nil {
		return Result{}, invalidFile("The file is not a valid .xlsx workbook.")
	}
	defer f.Close()

	have := map[string]bool{}
	for _, n := range f.GetSheetList() {
		have[n] = true
	}
	for _, n := range []string{ExpensesSheet, IncomeSheet} {
		if !have[n] {
			return Result{}, invalidFile("The " + n + " sheet is missing. Start from the template.")
		}
	}

	c := &checker{
		categories: fold(lk.Categories),
		sources:    fold(lk.Sources),
	}
	var res Result
	total := 0
	for _, s := range []struct {
		name, sheet string
		headers     []string
	}{
		{ExpensesSheet, store.SheetExpenses, ExpenseHeaders},
		{IncomeSheet, store.SheetIncome, IncomeHeaders},
	} {
		n, err := c.sheet(f, s.name, s.sheet, s.headers, total, &res)
		if err != nil {
			return Result{}, err
		}
		total += n
	}
	if total == 0 {
		return Result{}, invalidFile("The file has no data rows.")
	}
	return res, nil
}

type checker struct {
	categories, sources map[string]string // lower case -> name as the user wrote it
}

func fold(names []string) map[string]string {
	m := make(map[string]string, len(names))
	for _, n := range names {
		m[strings.ToLower(strings.TrimSpace(n))] = n
	}
	return m
}

// sheet checks one sheet and returns how many data rows it had.
func (c *checker) sheet(f *excelize.File, name, kind string, headers []string, already int, res *Result) (int, error) {
	it, err := f.Rows(name)
	if err != nil {
		return 0, invalidFile("The " + name + " sheet could not be read.")
	}
	defer it.Close()

	rowNum, count := 0, 0
	for it.Next() {
		rowNum++
		if rowNum > maxScanRows {
			return 0, invalidFile("The file has more than 50,000 rows.")
		}
		cells, err := it.Columns(excelize.Options{RawCellValue: true})
		if err != nil {
			return 0, invalidFile("The " + name + " sheet could not be read.")
		}
		if rowNum == 1 {
			if !headersMatch(cells, headers) {
				return 0, invalidFile("The " + name + " sheet's header row was changed. Start from the template.")
			}
			continue
		}
		vals := make([]string, len(headers))
		blank := true
		for i := range vals {
			if i < len(cells) {
				vals[i] = strings.TrimSpace(cells[i])
			}
			if vals[i] != "" {
				blank = false
			}
		}
		if blank {
			continue
		}
		count++
		if already+count > MaxRows {
			return 0, invalidFile("The file has more than 50,000 rows.")
		}
		var row store.ImportRow
		var issues []store.ImportIssue
		if kind == store.SheetExpenses {
			row, issues = c.expense(vals, headers, rowNum)
		} else {
			row, issues = c.income(vals, headers, rowNum)
		}
		row.Sheet, row.RowNumber = kind, rowNum
		row.Ready = len(issues) == 0
		if !row.Ready {
			orig, _ := json.Marshal(vals)
			o := string(orig)
			row.Original = &o
		}
		for i := range issues {
			issues[i].Sheet, issues[i].RowNumber = kind, rowNum
		}
		res.Rows = append(res.Rows, row)
		res.Issues = append(res.Issues, issues...)
	}
	if err := it.Error(); err != nil {
		return 0, invalidFile("The " + name + " sheet could not be read.")
	}
	return count, nil
}

func headersMatch(cells, want []string) bool {
	if len(cells) < len(want) {
		return false
	}
	for i, w := range want {
		if !strings.EqualFold(strings.TrimSpace(cells[i]), w) {
			return false
		}
	}
	return true
}

// rowCheck collects issues for one row.
type rowCheck struct {
	headers []string
	vals    []string
	issues  []store.ImportIssue
}

func (r *rowCheck) add(col int, code, msg string) {
	v := r.vals[col]
	if utf8.RuneCountInString(v) > maxValueLen {
		v = string([]rune(v)[:maxValueLen])
	}
	r.issues = append(r.issues, store.ImportIssue{Column: r.headers[col], Code: code, Value: v, Message: msg})
}

func (c *checker) expense(vals, headers []string, _ int) (store.ImportRow, []store.ImportIssue) {
	r := &rowCheck{headers: headers, vals: vals}
	var row store.ImportRow
	row.Date = r.date(0)

	if vals[1] == "" {
		r.add(1, CodeMissingValue, "Category is required.")
	} else if name, ok := c.categories[strings.ToLower(vals[1])]; !ok {
		r.add(1, CodeUnknownCategory, "This category does not exist. Add it under Categories first; it is not created for you.")
	} else {
		row.Category = &name
	}

	row.Merchant = r.text(2, maxMerchantLen, true, "Merchant")
	if vals[3] == "" {
		r.add(3, CodeMissingValue, "Amount is required.")
	} else if cents, code := ParseCents(vals[3]); code != "" {
		r.number(3, code)
	} else if cents == 0 {
		r.add(3, CodeZeroAmount, "Amount cannot be zero.")
	} else {
		row.Amount = &cents
	}
	row.Note = r.text(4, maxNoteLen, false, "Note")
	return row, r.issues
}

func (c *checker) income(vals, headers []string, _ int) (store.ImportRow, []store.ImportIssue) {
	r := &rowCheck{headers: headers, vals: vals}
	var row store.ImportRow
	row.Date = r.date(0)

	if vals[1] == "" {
		r.add(1, CodeMissingValue, "Source is required.")
	} else if name, ok := c.sources[strings.ToLower(vals[1])]; !ok {
		r.add(1, CodeUnknownIncomeSource, "This income source does not exist. Add it under Income sources first; it is not created for you.")
	} else {
		row.Source = &name
	}

	gross, okG := r.income(2)
	taxable, okT := r.income(3)
	net, okN := r.income(4)
	if okG && okT && taxable > gross {
		r.add(3, CodeTaxableExceedsGross, "Gross taxable cannot be more than gross.")
		okT = false
	}
	if okG && okN && net > gross {
		r.add(4, CodeNetExceedsGross, "Net cannot be more than gross.")
		okN = false
	}
	if okG && okT && okN {
		row.Gross, row.Taxable, row.Net = &gross, &taxable, &net
	}
	row.Note = r.text(5, maxNoteLen, false, "Note")
	return row, r.issues
}

// income reads a non-negative dollar column.
func (r *rowCheck) income(col int) (int64, bool) {
	if r.vals[col] == "" {
		r.add(col, CodeMissingValue, r.headers[col]+" is required.")
		return 0, false
	}
	cents, code := ParseCents(r.vals[col])
	if code != "" {
		r.number(col, code)
		return 0, false
	}
	if cents < 0 {
		r.add(col, CodeNegativeIncome, r.headers[col]+" cannot be negative.")
		return 0, false
	}
	return cents, true
}

func (r *rowCheck) number(col int, code string) {
	if code == CodeTooManyDecimals {
		r.add(col, code, r.headers[col]+" can have at most two decimals.")
		return
	}
	r.add(col, code, r.headers[col]+" is not a number.")
}

// text returns the cell, or nil when blank/invalid.
func (r *rowCheck) text(col, max int, required bool, label string) *string {
	v := r.vals[col]
	if v == "" {
		if required {
			r.add(col, CodeMissingValue, label+" is required.")
		}
		return nil
	}
	if utf8.RuneCountInString(v) > max {
		r.add(col, CodeTextTooLong, label+" is too long (at most "+strconv.Itoa(max)+" characters).")
		return nil
	}
	return &v
}

// date reads column col as an Excel date serial or YYYY-MM-DD text.
func (r *rowCheck) date(col int) *string {
	v := r.vals[col]
	if v == "" {
		r.add(col, CodeMissingValue, "Date is required.")
		return nil
	}
	if d, ok := parseDate(v); ok {
		return &d
	}
	r.add(col, CodeInvalidDate, "Use a real date, written YYYY-MM-DD.")
	return nil
}

func parseDate(v string) (string, bool) {
	if isoDate.MatchString(v) {
		t, err := time.Parse(time.DateOnly, v)
		if err != nil || t.Year() < 1900 {
			return "", false
		}
		return v, true
	}
	serial, err := strconv.ParseFloat(v, 64)
	if err != nil || serial < 1 || serial > 2958465 { // 1900-01-01 .. 9999-12-31
		return "", false
	}
	t, err := excelize.ExcelDateToTime(serial, false)
	if err != nil || t.Year() < 1900 {
		return "", false
	}
	return t.Format(time.DateOnly), true
}

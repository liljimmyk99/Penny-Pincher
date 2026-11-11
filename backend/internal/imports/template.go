// Package imports builds the Excel import template, reads and checks an
// uploaded file, and writes the problem-rows workbook. It never touches the
// database and never logs cell values or file contents.
package imports

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/xuri/excelize/v2"
)

// Sheet and column names, as written in the template.
const (
	ExpensesSheet = "Expenses"
	IncomeSheet   = "Income"
	HelpSheet     = "How to fill this in"
	listsSheet    = "Lists"
	ProblemHeader = "Problem"

	// dropdownRows is how many rows below the header get a dropdown.
	dropdownRows = 50000
)

var (
	ExpenseHeaders = []string{"Date", "Category", "Merchant", "Amount", "Note"}
	IncomeHeaders  = []string{"Date", "Source", "Gross", "Gross taxable", "Net", "Note"}
)

// SafeText stops spreadsheet formula injection: user-entered text starting
// with a formula character is prefixed with an apostrophe (OWASP).
func SafeText(s string) string {
	if s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0])) {
		return "'" + s
	}
	return s
}

// Template builds the import workbook: the Expenses and Income sheets with
// Category and Source dropdowns filled from the given names, a help sheet with
// examples (ignored on upload) and a hidden Lists sheet behind the dropdowns.
func Template(categories, sources []string) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()
	if err := f.SetSheetName("Sheet1", ExpensesSheet); err != nil {
		return nil, err
	}
	for _, name := range []string{IncomeSheet, HelpSheet, listsSheet} {
		if _, err := f.NewSheet(name); err != nil {
			return nil, err
		}
	}
	for i, c := range categories {
		_ = f.SetCellValue(listsSheet, cellName(1, i+1), SafeText(c))
	}
	for i, s := range sources {
		_ = f.SetCellValue(listsSheet, cellName(2, i+1), SafeText(s))
	}
	if err := f.SetSheetVisible(listsSheet, false); err != nil {
		return nil, err
	}

	bold, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	if err != nil {
		return nil, err
	}
	text, err := f.NewStyle(&excelize.Style{NumFmt: 49}) // "@": keep dates as typed
	if err != nil {
		return nil, err
	}
	for sheet, headers := range map[string][]string{ExpensesSheet: ExpenseHeaders, IncomeSheet: IncomeHeaders} {
		row := make([]any, len(headers))
		for i, h := range headers {
			row[i] = h
		}
		if err := f.SetSheetRow(sheet, "A1", &row); err != nil {
			return nil, err
		}
		end := cellName(len(headers), 1)
		if err := f.SetCellStyle(sheet, "A1", end, bold); err != nil {
			return nil, err
		}
		for col := 1; col <= len(headers); col++ {
			_ = f.SetColWidth(sheet, colName(col), colName(col), 18)
		}
	}
	_ = f.SetColStyle(ExpensesSheet, "A", text)
	_ = f.SetColStyle(IncomeSheet, "A", text)

	if err := dropdown(f, ExpensesSheet, "B", "A", len(categories)); err != nil {
		return nil, err
	}
	if err := dropdown(f, IncomeSheet, "B", "B", len(sources)); err != nil {
		return nil, err
	}
	if err := writeHelp(f, categories, sources); err != nil {
		return nil, err
	}
	f.SetActiveSheet(0)

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// dropdown limits column col of the sheet to the names in the Lists column.
func dropdown(f *excelize.File, sheet, col, listCol string, n int) error {
	if n == 0 {
		return nil
	}
	dv := excelize.NewDataValidation(true)
	dv.Sqref = fmt.Sprintf("%s2:%s%d", col, col, dropdownRows+1)
	dv.SetSqrefDropList(fmt.Sprintf("%s!$%s$1:$%s$%d", listsSheet, listCol, listCol, n))
	return f.AddDataValidation(sheet, dv)
}

func writeHelp(f *excelize.File, categories, sources []string) error {
	example := func(names []string) string {
		if len(names) == 0 {
			return ""
		}
		return names[0]
	}
	lines := [][]any{
		{"How to fill this in"},
		{"Use the Expenses sheet for spending and the Income sheet for paychecks and one-off income. This sheet is ignored when you upload."},
		{"Do not rename the sheets or change the header row. You can delete the example rows below, and the file can cover any number of years."},
		{},
		{"Column", "What to enter", "Example"},
		{"Date", "YYYY-MM-DD, or a real Excel date", "2019-03-05"},
		{"Category / Source", "Pick from the dropdown. Names that do not exist yet are reported as problems; nothing is created for you.", example(categories) + " / " + example(sources)},
		{"Merchant", "Where the money went (up to 100 characters)", "Corner Market"},
		{"Amount", "Dollars with at most two decimals. A refund is a negative amount.", "12.50  or  -12.50"},
		{"Gross, Gross taxable, Net", "Dollars with at most two decimals. Taxable and net cannot be more than gross.", "2500.00"},
		{"Note", "Optional (up to 500 characters)", ""},
	}
	for i, l := range lines {
		for j, v := range l {
			if s, ok := v.(string); ok {
				v = SafeText(s)
			}
			_ = f.SetCellValue(HelpSheet, cellName(j+1, i+1), v)
		}
	}
	_ = f.SetColWidth(HelpSheet, "A", "A", 26)
	_ = f.SetColWidth(HelpSheet, "B", "B", 80)
	_ = f.SetColWidth(HelpSheet, "C", "C", 24)
	return nil
}

func cellName(col, row int) string {
	n, _ := excelize.CoordinatesToCellName(col, row)
	return n
}

func colName(col int) string {
	n, _ := excelize.ColumnNumberToName(col)
	return n
}

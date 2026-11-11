package imports

import (
	"bytes"
	"encoding/json"
	"strings"

	"github.com/xuri/excelize/v2"

	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

// Problems builds the problem-rows workbook: the template layout (Expenses and
// Income sheets, the original cell values) plus a Problem column that lists
// what is wrong with each row. Fix the rows and upload the file again.
func Problems(rows []store.ImportRow, issues []store.ImportIssue) ([]byte, error) {
	type key struct {
		sheet string
		row   int
	}
	why := map[key][]string{}
	for _, is := range issues {
		k := key{is.Sheet, is.RowNumber}
		why[k] = append(why[k], is.Column+": "+is.Message)
	}

	f := excelize.NewFile()
	defer f.Close()
	if err := f.SetSheetName("Sheet1", ExpensesSheet); err != nil {
		return nil, err
	}
	if _, err := f.NewSheet(IncomeSheet); err != nil {
		return nil, err
	}
	bold, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	if err != nil {
		return nil, err
	}
	next := map[string]int{ExpensesSheet: 2, IncomeSheet: 2}
	for sheet, headers := range map[string][]string{ExpensesSheet: ExpenseHeaders, IncomeSheet: IncomeHeaders} {
		hs := make([]any, 0, len(headers)+1)
		for _, h := range headers {
			hs = append(hs, h)
		}
		hs = append(hs, ProblemHeader)
		if err := f.SetSheetRow(sheet, "A1", &hs); err != nil {
			return nil, err
		}
		if err := f.SetCellStyle(sheet, "A1", cellName(len(hs), 1), bold); err != nil {
			return nil, err
		}
		_ = f.SetColWidth(sheet, colName(len(hs)), colName(len(hs)), 60)
	}

	for _, r := range rows {
		sheet := ExpensesSheet
		width := len(ExpenseHeaders)
		if r.Sheet == store.SheetIncome {
			sheet, width = IncomeSheet, len(IncomeHeaders)
		}
		var cells []string
		if r.Original != nil {
			_ = json.Unmarshal([]byte(*r.Original), &cells)
		}
		out := make([]any, width+1)
		for i := 0; i < width; i++ {
			if i < len(cells) {
				out[i] = cells[i]
				if !plainColumn(r.Sheet, i) {
					out[i] = SafeText(cells[i])
				}
			} else {
				out[i] = ""
			}
		}
		out[width] = strings.Join(why[key{r.Sheet, r.RowNumber}], "; ")
		if err := f.SetSheetRow(sheet, cellName(1, next[sheet]), &out); err != nil {
			return nil, err
		}
		next[sheet]++
	}

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// plainColumn: dates and dollar amounts are written back exactly as found, so
// a negative amount ("-12.50") survives a fix-and-upload round trip. Free-text
// columns go through SafeText.
func plainColumn(sheet string, col int) bool {
	if col == 0 {
		return true
	}
	if sheet == store.SheetExpenses {
		return col == 3
	}
	return col >= 2 && col <= 4
}

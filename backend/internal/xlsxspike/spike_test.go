// Package xlsxspike holds the spike test for the Excel library decision
// (AGENTS.md §10, #93). It checks excelize against the import/export needs.
package xlsxspike

import (
	"bytes"
	"fmt"
	"strconv"
	"testing"

	"github.com/xuri/excelize/v2"
)

func buildTemplate(t *testing.T, categories []string) *bytes.Buffer {
	t.Helper()
	f := excelize.NewFile()
	defer f.Close()
	exp, _ := f.GetSheetName(0), 0
	if err := f.SetSheetName(exp, "Expenses"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.NewSheet("Income"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.NewSheet("Lists"); err != nil {
		t.Fatal(err)
	}
	for i, c := range categories {
		cell, _ := excelize.CoordinatesToCellName(1, i+1)
		_ = f.SetCellValue("Lists", cell, c)
	}
	if err := f.SetSheetVisible("Lists", false); err != nil {
		t.Fatal(err)
	}
	_ = f.SetSheetRow("Expenses", "A1", &[]any{"Date", "Category", "Merchant", "Amount", "Note"})
	dv := excelize.NewDataValidation(true)
	dv.Sqref = "B2:B1000"
	dv.SetSqrefDropList(fmt.Sprintf("Lists!$A$1:$A$%d", len(categories)))
	if err := f.AddDataValidation("Expenses", dv); err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatal(err)
	}
	return &buf
}

func TestTemplateRoundTrip(t *testing.T) {
	buf := buildTemplate(t, []string{"Food", "Other"})
	f, err := excelize.OpenReader(bytes.NewReader(buf.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	dvs, err := f.GetDataValidations("Expenses")
	if err != nil || len(dvs) != 1 || dvs[0].Formula1 != "Lists!$A$1:$A$2" {
		t.Fatalf("dropdown not preserved: %v %+v", err, dvs)
	}
	vis, _ := f.GetSheetVisible("Lists")
	if vis {
		t.Fatal("lists sheet should be hidden")
	}
}

func TestStreamingRead50kRowsAndDates(t *testing.T) {
	const rows = 50000
	f := excelize.NewFile()
	sw, err := f.NewStreamWriter("Sheet1")
	if err != nil {
		t.Fatal(err)
	}
	dateStyle, _ := f.NewStyle(&excelize.Style{NumFmt: 14})
	_ = sw.SetRow("A1", []any{"Date", "Amount"})
	for i := 2; i <= rows+1; i++ {
		cell, _ := excelize.CoordinatesToCellName(1, i)
		var d any = "2024-03-05"
		if i%2 == 0 {
			d = excelize.Cell{StyleID: dateStyle, Value: 45356.0} // 2024-03-05 serial
		}
		if err := sw.SetRow(cell, []any{d, 12.34}); err != nil {
			t.Fatal(err)
		}
	}
	if err := sw.Flush(); err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatal(err)
	}
	f.Close()

	r, err := excelize.OpenReader(bytes.NewReader(buf.Bytes()), excelize.Options{
		UnzipSizeLimit:    100 << 20,
		UnzipXMLSizeLimit: 20 << 20,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	it, err := r.Rows("Sheet1")
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for it.Next() {
		// One Columns call per row: the iterator is single-pass. Raw values
		// give the serial number for date cells and the text for text cells.
		cols, err := it.Columns(excelize.Options{RawCellValue: true})
		if err != nil {
			t.Fatal(err)
		}
		if n > 0 {
			if n%2 == 1 { // serial-date rows
				if cols[0] != "45356" {
					t.Fatalf("row %d raw = %q", n, cols[0])
				}
				serial, _ := strconv.ParseFloat(cols[0], 64)
				tm, err := excelize.ExcelDateToTime(serial, false)
				if err != nil || tm.Format("2006-01-02") != "2024-03-05" {
					t.Fatalf("serial conversion: %v %v", tm, err)
				}
			} else if cols[0] != "2024-03-05" {
				t.Fatalf("row %d text date = %q", n, cols[0])
			}
		}
		n++
	}
	if err := it.Close(); err != nil {
		t.Fatal(err)
	}
	if n != rows+1 {
		t.Fatalf("read %d rows, want %d", n, rows+1)
	}
}

func TestUnzipLimitRejectsBomb(t *testing.T) {
	buf := buildTemplate(t, []string{"Food"})
	_, err := excelize.OpenReader(bytes.NewReader(buf.Bytes()), excelize.Options{UnzipSizeLimit: 100})
	if err == nil {
		t.Fatal("expected unzip size limit error")
	}
}

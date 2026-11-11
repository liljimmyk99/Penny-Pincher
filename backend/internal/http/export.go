package http

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strconv"

	"github.com/xuri/excelize/v2"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/imports"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

// Column headers. Amounts come twice: the integer cents (exact, what every
// other part of the app uses) and a formatted dollars column for reading.
var (
	expenseHeaders = []string{"ID", "Date", "Category", "Merchant", "Amount (cents)", "Amount (formatted dollars)",
		"Type", "Note", "Refund of expense ID", "Confirmed"}
	incomeHeaders = []string{"ID", "Date", "Source", "Gross (cents)", "Gross taxable (cents)", "Net (cents)",
		"Gross (formatted dollars)", "Gross taxable (formatted dollars)", "Net (formatted dollars)", "Note", "Confirmed"}
)

// ExportData implements GET /v1/export. The file is built in memory, so any
// failure still yields a clean 500 instead of a truncated download.
func (s *Server) ExportData(ctx context.Context, req api.ExportDataRequestObject) (api.ExportDataResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	p := req.Params
	if !p.Format.Valid() {
		return api.ExportData400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(
			validationError(&store.ValidationError{Field: "format", Issue: "must be csv or xlsx"}))}, nil
	}
	var r store.ExportRange
	if p.From != nil {
		r.From = dateString(*p.From)
	}
	if p.To != nil {
		r.To = dateString(*p.To)
	}

	var (
		buf  bytes.Buffer
		err  error
		name = "penny-pincher-export"
	)
	if p.Format == api.Xlsx {
		err = writeXLSX(ctx, &buf, s.export, uid, r)
	} else {
		err = writeCSVZip(ctx, &buf, s.export, uid, r)
	}
	var ve *store.ValidationError
	if errors.As(err, &ve) {
		return api.ExportData400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(validationError(ve))}, nil
	}
	if err != nil {
		return nil, err
	}

	ext := map[api.ExportDataParamsFormat]string{api.Xlsx: ".xlsx", api.Csv: ".zip"}[p.Format]
	cd := `attachment; filename="` + name + ext + `"`
	hdr := api.ExportData200ResponseHeaders{ContentDisposition: &cd}
	n := int64(buf.Len())
	if p.Format == api.Xlsx {
		return api.ExportData200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{Body: &buf, Headers: hdr, ContentLength: n}, nil
	}
	return api.ExportData200ApplicationzipResponse{Body: &buf, Headers: hdr, ContentLength: n}, nil
}

func writeCSVZip(ctx context.Context, w io.Writer, e store.Export, uid int64, r store.ExportRange) error {
	zw := zip.NewWriter(w)
	f, err := zw.Create("expenses.csv")
	if err != nil {
		return err
	}
	cw := csv.NewWriter(f)
	_ = cw.Write(expenseHeaders)
	if err := e.Expenses(ctx, uid, r, func(x store.ExportExpense) error {
		return cw.Write(textRow(expenseCells(x)))
	}); err != nil {
		return err
	}
	cw.Flush()
	if err := cw.Error(); err != nil {
		return err
	}
	f, err = zw.Create("income.csv")
	if err != nil {
		return err
	}
	cw = csv.NewWriter(f)
	_ = cw.Write(incomeHeaders)
	if err := e.Income(ctx, uid, r, func(x store.ExportIncome) error {
		return cw.Write(textRow(incomeCells(x)))
	}); err != nil {
		return err
	}
	cw.Flush()
	if err := cw.Error(); err != nil {
		return err
	}
	return zw.Close()
}

func writeXLSX(ctx context.Context, w io.Writer, e store.Export, uid int64, r store.ExportRange) error {
	f := excelize.NewFile()
	defer f.Close()
	const exp, inc = "Expenses", "Income"
	if err := f.SetSheetName("Sheet1", exp); err != nil {
		return err
	}
	if _, err := f.NewSheet(inc); err != nil {
		return err
	}
	fill := func(sheet string, headers []string, each func(add func([]any) error) error) error {
		sw, err := f.NewStreamWriter(sheet)
		if err != nil {
			return err
		}
		row := 1
		add := func(cells []any) error {
			ref, err := excelize.CoordinatesToCellName(1, row)
			if err != nil {
				return err
			}
			row++
			return sw.SetRow(ref, cells)
		}
		hs := make([]any, len(headers))
		for i, h := range headers {
			hs[i] = h
		}
		if err := add(hs); err != nil {
			return err
		}
		if err := each(add); err != nil {
			return err
		}
		return sw.Flush()
	}
	if err := fill(exp, expenseHeaders, func(add func([]any) error) error {
		return e.Expenses(ctx, uid, r, func(x store.ExportExpense) error { return add(sheetRow(expenseCells(x))) })
	}); err != nil {
		return err
	}
	if err := fill(inc, incomeHeaders, func(add func([]any) error) error {
		return e.Income(ctx, uid, r, func(x store.ExportIncome) error { return add(sheetRow(incomeCells(x))) })
	}); err != nil {
		return err
	}
	return f.Write(w)
}

// cell is a value that is either a number (integer cents, ids) or text.
type cell struct {
	n     int64
	s     string
	text  bool
	exact bool // generated text (dates, formatted amounts): never escaped
}

func num(n int64) cell    { return cell{n: n} }
func str(s string) cell   { return cell{s: s, text: true} }
func blank() cell         { return cell{text: true} }
func plain(s string) cell { return cell{s: s, text: true, exact: true} }
func yesNo(b bool) cell   { return plain(map[bool]string{true: "yes", false: "no"}[b]) }

func expenseCells(x store.ExportExpense) []cell {
	ref := blank()
	if x.RefundedExpenseID != nil {
		ref = num(*x.RefundedExpenseID)
	}
	return []cell{num(x.ID), plain(x.Date), str(x.Category), str(x.Merchant), num(x.AmountCents),
		plain(formatCents(x.AmountCents)), plain(x.Type), str(x.Note), ref, yesNo(x.Confirmed)}
}

func incomeCells(x store.ExportIncome) []cell {
	return []cell{num(x.ID), plain(x.Date), str(x.Source), num(x.GrossCents), num(x.GrossTaxableCents), num(x.NetCents),
		plain(formatCents(x.GrossCents)), plain(formatCents(x.GrossTaxableCents)), plain(formatCents(x.NetCents)),
		str(x.Note), yesNo(x.Confirmed)}
}

// textRow renders cells for CSV.
func textRow(cs []cell) []string {
	out := make([]string, len(cs))
	for i, c := range cs {
		switch {
		case !c.text:
			out[i] = strconv.FormatInt(c.n, 10)
		case c.exact:
			out[i] = c.s
		default:
			out[i] = safeText(c.s)
		}
	}
	return out
}

// sheetRow renders cells for Excel: numbers stay numeric.
func sheetRow(cs []cell) []any {
	out := make([]any, len(cs))
	for i, c := range cs {
		switch {
		case !c.text:
			out[i] = c.n
		case c.exact:
			out[i] = c.s
		default:
			out[i] = safeText(c.s)
		}
	}
	return out
}

// safeText stops spreadsheet formula injection; see imports.SafeText.
func safeText(s string) string { return imports.SafeText(s) }

// formatCents renders integer cents as dollars with two decimals, without floats.
func formatCents(c int64) string {
	sign := ""
	u := uint64(c)
	if c < 0 {
		sign = "-"
		u = -u
	}
	return fmt.Sprintf("%s%d.%02d", sign, u/100, u%100)
}

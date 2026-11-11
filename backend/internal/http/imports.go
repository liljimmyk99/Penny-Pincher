package http

import (
	"bytes"
	"context"
	"errors"
	"io"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/imports"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

const (
	// maxImportFile is the largest upload (AGENTS.md §10). The request body cap
	// in limits.go is a little higher to allow for multipart overhead.
	maxImportFile = 10 << 20
	// maxIssuesListed is how many issues the Import response lists; the rest
	// are in the problems download.
	maxIssuesListed = 500
	maxFileNameLen  = 200
)

// DownloadImportTemplate implements GET /v1/imports/template.
func (s *Server) DownloadImportTemplate(ctx context.Context, _ api.DownloadImportTemplateRequestObject) (api.DownloadImportTemplateResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	cats, srcs, err := s.importLookups(ctx, uid)
	if err != nil {
		return nil, err
	}
	data, err := imports.Template(cats, srcs)
	if err != nil {
		return nil, err
	}
	cd := `attachment; filename="penny-pincher-import.xlsx"`
	return api.DownloadImportTemplate200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body:          bytes.NewReader(data),
		Headers:       api.DownloadImportTemplate200ResponseHeaders{ContentDisposition: &cd},
		ContentLength: int64(len(data)),
	}, nil
}

// importLookups returns the user's current category and income source names.
func (s *Server) importLookups(ctx context.Context, uid int64) (cats, srcs []string, err error) {
	cs, err := s.categories.List(ctx, uid)
	if err != nil {
		return nil, nil, err
	}
	ss, err := s.incomeSources.List(ctx, uid)
	if err != nil {
		return nil, nil, err
	}
	for _, c := range cs {
		cats = append(cats, c.Name)
	}
	for _, x := range ss {
		srcs = append(srcs, x.Name)
	}
	return cats, srcs, nil
}

// UploadImport implements POST /v1/imports: it checks the file and stores the
// result for review. It never writes expenses, income entries or merchants.
func (s *Server) UploadImport(ctx context.Context, req api.UploadImportRequestObject) (api.UploadImportResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	tooLarge := api.UploadImport413JSONResponse{PayloadTooLargeJSONResponse: api.PayloadTooLargeJSONResponse(
		newError(api.ErrorErrorCodeFileTooLarge, "The file is larger than 10 MB."))}
	badFile := func(msg string) api.UploadImportResponseObject {
		return api.UploadImport400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(
			newError(api.ErrorErrorCodeInvalidImportFile, msg))}
	}

	var data []byte
	name := ""
	found := false
	for !found {
		part, err := req.Body.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			if isTooLarge(err) {
				return tooLarge, nil
			}
			return badFile("The upload could not be read."), nil
		}
		if part.FormName() != "file" {
			continue
		}
		data, err = io.ReadAll(io.LimitReader(part, maxImportFile+1))
		if err != nil {
			if isTooLarge(err) {
				return tooLarge, nil
			}
			return badFile("The upload could not be read."), nil
		}
		name, found = part.FileName(), true
	}
	if !found {
		return badFile("The upload has no file."), nil
	}
	if len(data) > maxImportFile {
		return tooLarge, nil
	}

	cats, srcs, err := s.importLookups(ctx, uid)
	if err != nil {
		return nil, err
	}
	res, err := imports.Parse(data, imports.Lookups{Categories: cats, Sources: srcs})
	var bad *imports.ErrInvalidFile
	if errors.As(err, &bad) {
		return badFile(bad.Reason), nil
	}
	if err != nil {
		return nil, err
	}

	imp, err := s.imports.Create(ctx, uid, store.NewImport{FileName: cleanFileName(name), Rows: res.Rows, Issues: res.Issues})
	if err != nil {
		return nil, err
	}
	out, err := s.importResponse(ctx, uid, imp)
	if err != nil {
		return nil, err
	}
	return api.UploadImport201JSONResponse(out), nil
}

// cleanFileName keeps the uploaded name for the history list: no directories,
// no control characters, bounded length.
func cleanFileName(n string) string {
	n = strings.ReplaceAll(n, `\`, "/")
	n = filepath.Base(n)
	n = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, n)
	n = strings.TrimSpace(n)
	if n == "." || n == "/" || n == "" {
		return "import.xlsx"
	}
	if utf8.RuneCountInString(n) > maxFileNameLen {
		n = string([]rune(n)[:maxFileNameLen])
	}
	return n
}

// ListImports implements GET /v1/imports.
func (s *Server) ListImports(ctx context.Context, req api.ListImportsRequestObject) (api.ListImportsResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	var f store.ImportFilter
	if req.Params.Status != nil {
		f.Status = string(*req.Params.Status)
	}
	if _, err := s.imports.ExpireStale(ctx, uid, s.now()); err != nil {
		return nil, err
	}
	list, err := s.imports.List(ctx, uid, f)
	var ve *store.ValidationError
	if errors.As(err, &ve) {
		return api.ListImports400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(validationError(ve))}, nil
	}
	if err != nil {
		return nil, err
	}
	items := make([]api.ImportSummary, len(list))
	for i, imp := range list {
		items[i] = importSummary(imp)
	}
	return api.ListImports200JSONResponse{Items: items}, nil
}

// GetImport implements GET /v1/imports/{id}.
func (s *Server) GetImport(ctx context.Context, req api.GetImportRequestObject) (api.GetImportResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	notFound := api.GetImport404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
		newError(api.ErrorErrorCodeNotFound, "Import not found."))}
	id, ok := parseID(req.Id)
	if !ok {
		return notFound, nil
	}
	if _, err := s.imports.ExpireStale(ctx, uid, s.now()); err != nil {
		return nil, err
	}
	imp, err := s.imports.Get(ctx, uid, id)
	if errors.Is(err, store.ErrNotFound) {
		return notFound, nil
	}
	if err != nil {
		return nil, err
	}
	out, err := s.importResponse(ctx, uid, imp)
	if err != nil {
		return nil, err
	}
	return api.GetImport200JSONResponse(out), nil
}

// DiscardImport implements DELETE /v1/imports/{id}.
func (s *Server) DiscardImport(ctx context.Context, req api.DiscardImportRequestObject) (api.DiscardImportResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	notFound := api.DiscardImport404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
		newError(api.ErrorErrorCodeNotFound, "Import not found."))}
	id, ok := parseID(req.Id)
	if !ok {
		return notFound, nil
	}
	if _, err := s.imports.ExpireStale(ctx, uid, s.now()); err != nil {
		return nil, err
	}
	err := s.imports.Discard(ctx, uid, id)
	switch {
	case err == nil:
		return api.DiscardImport204Response{}, nil
	case errors.Is(err, store.ErrNotFound):
		return notFound, nil
	case errors.Is(err, store.ErrImportNotInReview):
		return api.DiscardImport409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(
			newError(api.ErrorErrorCodeImportWrongStatus, "Only an import that is still in review can be discarded."))}, nil
	}
	return nil, err
}

// DownloadImportProblems implements GET /v1/imports/{id}/problems.
func (s *Server) DownloadImportProblems(ctx context.Context, req api.DownloadImportProblemsRequestObject) (api.DownloadImportProblemsResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	notFound := api.DownloadImportProblems404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
		newError(api.ErrorErrorCodeNotFound, "Import not found."))}
	id, ok := parseID(req.Id)
	if !ok {
		return notFound, nil
	}
	if _, err := s.imports.ExpireStale(ctx, uid, s.now()); err != nil {
		return nil, err
	}
	imp, err := s.imports.Get(ctx, uid, id)
	if errors.Is(err, store.ErrNotFound) {
		return notFound, nil
	}
	if err != nil {
		return nil, err
	}
	rows, err := s.imports.Rows(ctx, uid, id, false)
	if err != nil {
		return nil, err
	}
	issues, _, err := s.imports.Issues(ctx, uid, id, 0)
	if err != nil {
		return nil, err
	}
	data, err := imports.Problems(rows, issues)
	if err != nil {
		return nil, err
	}
	cd := `attachment; filename="` + problemsFileName(imp.FileName) + `"`
	return api.DownloadImportProblems200ApplicationvndOpenxmlformatsOfficedocumentSpreadsheetmlSheetResponse{
		Body:          bytes.NewReader(data),
		Headers:       api.DownloadImportProblems200ResponseHeaders{ContentDisposition: &cd},
		ContentLength: int64(len(data)),
	}, nil
}

// problemsFileName turns "my-history.xlsx" into "my-history-problems.xlsx",
// keeping only characters that are safe in a header.
func problemsFileName(upload string) string {
	base := strings.TrimSuffix(upload, filepath.Ext(upload))
	base = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_', r == '.':
			return r
		case r == ' ':
			return '-'
		}
		return -1
	}, base)
	if base == "" {
		base = "import"
	}
	return base + "-problems.xlsx"
}

func importSummary(imp store.Import) api.ImportSummary {
	return api.ImportSummary{
		CreatedAt:        &imp.CreatedAt,
		EntriesImported:  imp.EntriesImported,
		FileName:         imp.FileName,
		FinishedAt:       nullableOf(imp.FinishedAt),
		FirstMonth:       nullableOf(imp.FirstMonth),
		Id:               formatID(imp.ID),
		LastMonth:        nullableOf(imp.LastMonth),
		RowsReady:        imp.RowsReady,
		RowsWithProblems: imp.RowsWithProblems,
		Status:           api.ImportStatus(imp.Status),
	}
}

// importResponse builds the full Import: the summary figures plus the review
// tables and the first 500 issues.
func (s *Server) importResponse(ctx context.Context, uid int64, imp store.Import) (api.Import, error) {
	years, err := s.imports.Years(ctx, uid, imp.ID)
	if err != nil {
		return api.Import{}, err
	}
	months, err := s.imports.ExistingMonths(ctx, uid, imp.ID)
	if err != nil {
		return api.Import{}, err
	}
	issues, more, err := s.imports.Issues(ctx, uid, imp.ID, maxIssuesListed)
	if err != nil {
		return api.Import{}, err
	}

	out := api.Import{
		CreatedAt:        &imp.CreatedAt,
		EntriesImported:  imp.EntriesImported,
		ExpenseRows:      imp.ExpenseRows,
		FailureReason:    nullableOf(imp.FailureReason),
		FileName:         imp.FileName,
		FinishedAt:       nullableOf(imp.FinishedAt),
		FirstMonth:       nullableOf(imp.FirstMonth),
		Id:               formatID(imp.ID),
		IncomeRows:       imp.IncomeRows,
		Issues:           make([]api.ImportIssue, len(issues)),
		IssuesTruncated:  more,
		LastMonth:        nullableOf(imp.LastMonth),
		RowsReady:        imp.RowsReady,
		RowsWithProblems: imp.RowsWithProblems,
		Status:           api.ImportStatus(imp.Status),
		Years:            make([]api.ImportYear, len(years)),
	}
	for i, y := range years {
		out.Years[i] = api.ImportYear{
			Year: y.Year, Months: y.Months, ExpenseRows: y.ExpenseRows, IncomeRows: y.IncomeRows,
			SpentCents: y.SpentCents, RowsWithProblems: y.RowsWithProblems,
		}
	}
	for _, m := range months {
		out.MonthsWithExistingEntries = append(out.MonthsWithExistingEntries, struct {
			ExistingEntries int `json:"existing_entries"`

			// FileEntries Ready rows in the file for this month.
			FileEntries int `json:"file_entries"`

			// Month Examples: 2026-10
			Month api.YearMonth `json:"month"`
		}{ExistingEntries: m.ExistingEntries, FileEntries: m.FileEntries, Month: m.Month})
	}
	out.MonthsWithExistingEntries = nonNil(out.MonthsWithExistingEntries) // JSON [] rather than null
	for i, is := range issues {
		out.Issues[i] = api.ImportIssue{
			Code: api.ImportIssueCode(is.Code), Column: is.Column, Message: is.Message,
			Row: is.RowNumber, Sheet: api.ImportSheet(is.Sheet), Value: is.Value,
		}
	}
	return out, nil
}

func nonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}

package http

import (
	"context"
	"errors"
	"net/http"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

const msgIncomeEntryNotFound = "No such income entry."

// ListIncomeEntries implements GET /v1/income-entries.
func (s *Server) ListIncomeEntries(ctx context.Context, req api.ListIncomeEntriesRequestObject) (api.ListIncomeEntriesResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	p := req.Params
	f := store.IncomeEntryFilter{Month: p.Month, Confirmed: p.Confirmed, Limit: p.Limit, Cursor: p.Cursor}
	if p.From != nil {
		d := p.From.String()
		f.From = &d
	}
	if p.To != nil {
		d := p.To.String()
		f.To = &d
	}
	if p.IncomeSourceId != nil {
		// An id that is not one of ours matches nothing, like another user's.
		id, _ := parseID(*p.IncomeSourceId)
		f.SourceID = &id
	}
	page, err := s.incomeEntries.List(ctx, uid, f)
	if status, e, ok := incomeEntryError(err); ok && status == http.StatusBadRequest {
		return api.ListIncomeEntries400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}
	items := make([]api.IncomeEntry, len(page.Items))
	for i, e := range page.Items {
		items[i] = toAPIIncomeEntry(e)
	}
	return api.ListIncomeEntries200JSONResponse{Items: items, NextCursor: nullableOf(page.NextCursor)}, nil
}

// CreateIncomeEntry implements POST /v1/income-entries.
func (s *Server) CreateIncomeEntry(ctx context.Context, req api.CreateIncomeEntryRequestObject) (api.CreateIncomeEntryResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	b := req.Body
	// A malformed source id parses as 0, which the store reports as not one
	// of the user's sources.
	src, _ := parseID(b.IncomeSourceId)
	var (
		entry store.IncomeEntry
		err   error
	)
	if b.Date.IsZero() {
		err = &store.ValidationError{Field: "date", Issue: "is required"}
	} else {
		entry, err = s.incomeEntries.Create(ctx, uid, store.NewIncomeEntry{
			SourceID:          src,
			Date:              b.Date.String(),
			GrossCents:        b.GrossCents,
			GrossTaxableCents: b.GrossTaxableCents,
			NetCents:          b.NetCents,
			Note:              ptrOf(b.Note),
			Confirmed:         b.Confirmed == nil || *b.Confirmed,
		})
	}
	if status, e, ok := incomeEntryError(err); ok && status == http.StatusBadRequest {
		return api.CreateIncomeEntry400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.CreateIncomeEntry201JSONResponse(toAPIIncomeEntry(entry)), nil
}

// GetIncomeEntry implements GET /v1/income-entries/{id}.
func (s *Server) GetIncomeEntry(ctx context.Context, req api.GetIncomeEntryRequestObject) (api.GetIncomeEntryResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	id, ok := parseID(req.Id)
	if !ok {
		return api.GetIncomeEntry404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, msgIncomeEntryNotFound))}, nil
	}
	entry, err := s.incomeEntries.Get(ctx, uid, id)
	if status, e, ok := incomeEntryError(err); ok && status == http.StatusNotFound {
		return api.GetIncomeEntry404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.GetIncomeEntry200JSONResponse(toAPIIncomeEntry(entry)), nil
}

// UpdateIncomeEntry implements PATCH /v1/income-entries/{id}.
func (s *Server) UpdateIncomeEntry(ctx context.Context, req api.UpdateIncomeEntryRequestObject) (api.UpdateIncomeEntryResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	id, ok := parseID(req.Id)
	if !ok {
		return api.UpdateIncomeEntry404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, msgIncomeEntryNotFound))}, nil
	}
	b := req.Body
	p := store.IncomeEntryPatch{
		GrossCents:        b.GrossCents,
		GrossTaxableCents: b.GrossTaxableCents,
		NetCents:          b.NetCents,
		SetNote:           b.Note.IsSpecified(),
		Note:              ptrOf(b.Note),
		Confirmed:         b.Confirmed,
	}
	if b.Date != nil {
		d := b.Date.String()
		p.Date = &d
	}
	if b.IncomeSourceId != nil {
		src, _ := parseID(*b.IncomeSourceId) // malformed → 0, rejected by the store
		p.SourceID = &src
	}
	entry, err := s.incomeEntries.Update(ctx, uid, id, p)
	if status, e, ok := incomeEntryError(err); ok {
		switch status {
		case http.StatusBadRequest:
			return api.UpdateIncomeEntry400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusNotFound:
			return api.UpdateIncomeEntry404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.UpdateIncomeEntry200JSONResponse(toAPIIncomeEntry(entry)), nil
}

// DeleteIncomeEntry implements DELETE /v1/income-entries/{id}.
func (s *Server) DeleteIncomeEntry(ctx context.Context, req api.DeleteIncomeEntryRequestObject) (api.DeleteIncomeEntryResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	id, ok := parseID(req.Id)
	if !ok {
		return api.DeleteIncomeEntry404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, msgIncomeEntryNotFound))}, nil
	}
	err := s.incomeEntries.Delete(ctx, uid, id)
	if status, e, ok := incomeEntryError(err); ok && status == http.StatusNotFound {
		return api.DeleteIncomeEntry404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.DeleteIncomeEntry204Response{}, nil
}

// incomeEntryError maps a store error to an HTTP status and error body. ok is
// false for nil and for unexpected errors, which become 500.
func incomeEntryError(err error) (int, api.Error, bool) {
	var ve *store.ValidationError
	switch {
	case err == nil:
		return 0, api.Error{}, false
	case errors.As(err, &ve):
		return http.StatusBadRequest, validationError(ve), true
	case errors.Is(err, store.ErrNotFound):
		return http.StatusNotFound, newError(api.ErrorErrorCodeNotFound, msgIncomeEntryNotFound), true
	}
	return 0, api.Error{}, false
}

func toAPIIncomeEntry(e store.IncomeEntry) api.IncomeEntry {
	var apply *string
	if e.TemplateApplyID != nil {
		s := formatID(*e.TemplateApplyID)
		apply = &s
	}
	date, _ := parseAPIDate(e.Date) // the schema's CHECK guarantees a valid date
	return api.IncomeEntry{
		Id:                formatID(e.ID),
		IncomeSourceId:    formatID(e.SourceID),
		Date:              date,
		GrossCents:        e.GrossCents,
		GrossTaxableCents: e.GrossTaxableCents,
		NetCents:          e.NetCents,
		Note:              nullableOf(e.Note),
		Confirmed:         e.Confirmed,
		TemplateApplyId:   nullableOf(apply),
		CreatedAt:         &e.CreatedAt,
		UpdatedAt:         &e.UpdatedAt,
	}
}

func parseAPIDate(s string) (openapi_types.Date, error) {
	var d openapi_types.Date
	err := d.UnmarshalText([]byte(s))
	return d, err
}

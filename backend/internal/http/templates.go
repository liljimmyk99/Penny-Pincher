package http

import (
	"context"
	"errors"
	"net/http"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

const (
	msgTemplateNotFound     = "No such template."
	msgTemplateItemNotFound = "No such template item."
	msgTemplateNameTaken    = "A template with this name already exists."
)

// ListTemplates implements GET /v1/templates.
func (s *Server) ListTemplates(ctx context.Context, _ api.ListTemplatesRequestObject) (api.ListTemplatesResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	ts, err := s.templates.List(ctx, uid)
	if err != nil {
		return nil, err
	}
	out := make([]api.TemplateSummary, len(ts))
	for i, t := range ts {
		out[i] = api.TemplateSummary{
			Id:               formatID(t.ID),
			Name:             t.Name,
			ExpenseItemCount: t.ExpenseItemCount,
			IncomeItemCount:  t.IncomeItemCount,
			CreatedAt:        &t.CreatedAt,
			UpdatedAt:        &t.UpdatedAt,
		}
	}
	return api.ListTemplates200JSONResponse{Items: out}, nil
}

// CreateTemplate implements POST /v1/templates.
func (s *Server) CreateTemplate(ctx context.Context, req api.CreateTemplateRequestObject) (api.CreateTemplateResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	t, err := s.templates.Create(ctx, uid, req.Body.Name)
	if status, e, ok := templateError(err, msgTemplateNotFound); ok {
		switch status {
		case http.StatusBadRequest:
			return api.CreateTemplate400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusConflict:
			return api.CreateTemplate409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.CreateTemplate201JSONResponse(toAPITemplate(t)), nil
}

// GetTemplate implements GET /v1/templates/{id}.
func (s *Server) GetTemplate(ctx context.Context, req api.GetTemplateRequestObject) (api.GetTemplateResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	notFound := api.GetTemplate404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
		newError(api.ErrorErrorCodeNotFound, msgTemplateNotFound))}
	id, ok := parseID(req.Id)
	if !ok {
		return notFound, nil
	}
	t, err := s.templates.Get(ctx, uid, id)
	if errors.Is(err, store.ErrNotFound) {
		return notFound, nil
	}
	if err != nil {
		return nil, err
	}
	return api.GetTemplate200JSONResponse(toAPITemplate(t)), nil
}

// RenameTemplate implements PATCH /v1/templates/{id}.
func (s *Server) RenameTemplate(ctx context.Context, req api.RenameTemplateRequestObject) (api.RenameTemplateResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	id, ok := parseID(req.Id)
	if !ok {
		return api.RenameTemplate404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, msgTemplateNotFound))}, nil
	}
	t, err := s.templates.Rename(ctx, uid, id, req.Body.Name)
	if status, e, ok := templateError(err, msgTemplateNotFound); ok {
		switch status {
		case http.StatusBadRequest:
			return api.RenameTemplate400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusNotFound:
			return api.RenameTemplate404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(e)}, nil
		case http.StatusConflict:
			return api.RenameTemplate409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.RenameTemplate200JSONResponse(toAPITemplate(t)), nil
}

// DeleteTemplate implements DELETE /v1/templates/{id}.
func (s *Server) DeleteTemplate(ctx context.Context, req api.DeleteTemplateRequestObject) (api.DeleteTemplateResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	notFound := api.DeleteTemplate404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
		newError(api.ErrorErrorCodeNotFound, msgTemplateNotFound))}
	id, ok := parseID(req.Id)
	if !ok {
		return notFound, nil
	}
	err := s.templates.Delete(ctx, uid, id)
	if errors.Is(err, store.ErrNotFound) {
		return notFound, nil
	}
	if err != nil {
		return nil, err
	}
	return api.DeleteTemplate204Response{}, nil
}

// CreateTemplateExpenseItem implements POST /v1/templates/{id}/expense-items.
func (s *Server) CreateTemplateExpenseItem(ctx context.Context, req api.CreateTemplateExpenseItemRequestObject) (api.CreateTemplateExpenseItemResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	id, ok := parseID(req.Id)
	if !ok {
		return api.CreateTemplateExpenseItem404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, msgTemplateNotFound))}, nil
	}
	b := req.Body
	it, err := s.templates.CreateExpenseItem(ctx, uid, id, store.NewTemplateExpenseItem{
		CategoryID:   idOrZero(b.CategoryId),
		MerchantName: b.MerchantName,
		DayOfMonth:   b.DayOfMonth,
		AmountCents:  b.AmountCents,
		Note:         ptrOf(b.Note),
		SortOrder:    b.SortOrder,
	})
	if status, e, ok := templateError(err, msgTemplateNotFound); ok {
		switch status {
		case http.StatusBadRequest:
			return api.CreateTemplateExpenseItem400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusNotFound:
			return api.CreateTemplateExpenseItem404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.CreateTemplateExpenseItem201JSONResponse(toAPITemplateExpenseItem(it)), nil
}

// UpdateTemplateExpenseItem implements PATCH /v1/templates/{id}/expense-items/{item_id}.
func (s *Server) UpdateTemplateExpenseItem(ctx context.Context, req api.UpdateTemplateExpenseItemRequestObject) (api.UpdateTemplateExpenseItemResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	tid, ok1 := parseID(req.Id)
	iid, ok2 := parseID(req.ItemId)
	if !ok1 || !ok2 {
		return api.UpdateTemplateExpenseItem404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, msgTemplateItemNotFound))}, nil
	}
	b := req.Body
	p := store.TemplateExpenseItemPatch{
		MerchantName: b.MerchantName,
		DayOfMonth:   b.DayOfMonth,
		AmountCents:  b.AmountCents,
		SetNote:      b.Note.IsSpecified(),
		Note:         ptrOf(b.Note),
		SortOrder:    b.SortOrder,
	}
	if b.CategoryId != nil {
		id := idOrZero(*b.CategoryId)
		p.CategoryID = &id
	}
	it, err := s.templates.UpdateExpenseItem(ctx, uid, tid, iid, p)
	if status, e, ok := templateError(err, msgTemplateItemNotFound); ok {
		switch status {
		case http.StatusBadRequest:
			return api.UpdateTemplateExpenseItem400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusNotFound:
			return api.UpdateTemplateExpenseItem404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.UpdateTemplateExpenseItem200JSONResponse(toAPITemplateExpenseItem(it)), nil
}

// DeleteTemplateExpenseItem implements DELETE /v1/templates/{id}/expense-items/{item_id}.
func (s *Server) DeleteTemplateExpenseItem(ctx context.Context, req api.DeleteTemplateExpenseItemRequestObject) (api.DeleteTemplateExpenseItemResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	notFound := api.DeleteTemplateExpenseItem404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
		newError(api.ErrorErrorCodeNotFound, msgTemplateItemNotFound))}
	tid, ok1 := parseID(req.Id)
	iid, ok2 := parseID(req.ItemId)
	if !ok1 || !ok2 {
		return notFound, nil
	}
	err := s.templates.DeleteExpenseItem(ctx, uid, tid, iid)
	if errors.Is(err, store.ErrNotFound) {
		return notFound, nil
	}
	if err != nil {
		return nil, err
	}
	return api.DeleteTemplateExpenseItem204Response{}, nil
}

// CreateTemplateIncomeItem implements POST /v1/templates/{id}/income-items.
func (s *Server) CreateTemplateIncomeItem(ctx context.Context, req api.CreateTemplateIncomeItemRequestObject) (api.CreateTemplateIncomeItemResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	id, ok := parseID(req.Id)
	if !ok {
		return api.CreateTemplateIncomeItem404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, msgTemplateNotFound))}, nil
	}
	b := req.Body
	it, err := s.templates.CreateIncomeItem(ctx, uid, id, store.NewTemplateIncomeItem{
		SourceID:          idOrZero(b.IncomeSourceId),
		DayOfMonth:        b.DayOfMonth,
		GrossCents:        b.GrossCents,
		GrossTaxableCents: b.GrossTaxableCents,
		NetCents:          b.NetCents,
		Note:              ptrOf(b.Note),
		SortOrder:         b.SortOrder,
	})
	if status, e, ok := templateError(err, msgTemplateNotFound); ok {
		switch status {
		case http.StatusBadRequest:
			return api.CreateTemplateIncomeItem400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusNotFound:
			return api.CreateTemplateIncomeItem404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.CreateTemplateIncomeItem201JSONResponse(toAPITemplateIncomeItem(it)), nil
}

// UpdateTemplateIncomeItem implements PATCH /v1/templates/{id}/income-items/{item_id}.
func (s *Server) UpdateTemplateIncomeItem(ctx context.Context, req api.UpdateTemplateIncomeItemRequestObject) (api.UpdateTemplateIncomeItemResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	tid, ok1 := parseID(req.Id)
	iid, ok2 := parseID(req.ItemId)
	if !ok1 || !ok2 {
		return api.UpdateTemplateIncomeItem404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, msgTemplateItemNotFound))}, nil
	}
	b := req.Body
	p := store.TemplateIncomeItemPatch{
		DayOfMonth:        b.DayOfMonth,
		GrossCents:        b.GrossCents,
		GrossTaxableCents: b.GrossTaxableCents,
		NetCents:          b.NetCents,
		SetNote:           b.Note.IsSpecified(),
		Note:              ptrOf(b.Note),
		SortOrder:         b.SortOrder,
	}
	if b.IncomeSourceId != nil {
		id := idOrZero(*b.IncomeSourceId)
		p.SourceID = &id
	}
	it, err := s.templates.UpdateIncomeItem(ctx, uid, tid, iid, p)
	if status, e, ok := templateError(err, msgTemplateItemNotFound); ok {
		switch status {
		case http.StatusBadRequest:
			return api.UpdateTemplateIncomeItem400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusNotFound:
			return api.UpdateTemplateIncomeItem404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.UpdateTemplateIncomeItem200JSONResponse(toAPITemplateIncomeItem(it)), nil
}

// DeleteTemplateIncomeItem implements DELETE /v1/templates/{id}/income-items/{item_id}.
func (s *Server) DeleteTemplateIncomeItem(ctx context.Context, req api.DeleteTemplateIncomeItemRequestObject) (api.DeleteTemplateIncomeItemResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	notFound := api.DeleteTemplateIncomeItem404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
		newError(api.ErrorErrorCodeNotFound, msgTemplateItemNotFound))}
	tid, ok1 := parseID(req.Id)
	iid, ok2 := parseID(req.ItemId)
	if !ok1 || !ok2 {
		return notFound, nil
	}
	err := s.templates.DeleteIncomeItem(ctx, uid, tid, iid)
	if errors.Is(err, store.ErrNotFound) {
		return notFound, nil
	}
	if err != nil {
		return nil, err
	}
	return api.DeleteTemplateIncomeItem204Response{}, nil
}

// templateError maps a store error to an HTTP status and error body.
// notFound is the message for ErrNotFound (a missing template or item). ok is
// false for nil and for unexpected errors, which become 500.
func templateError(err error, notFound string) (int, api.Error, bool) {
	var ve *store.ValidationError
	switch {
	case err == nil:
		return 0, api.Error{}, false
	case errors.As(err, &ve):
		return http.StatusBadRequest, validationError(ve), true
	case errors.Is(err, store.ErrNotFound):
		return http.StatusNotFound, newError(api.ErrorErrorCodeNotFound, notFound), true
	case errors.Is(err, store.ErrNameTaken):
		return http.StatusConflict, newError(api.ErrorErrorCodeNameTaken, msgTemplateNameTaken), true
	}
	return 0, api.Error{}, false
}

func toAPITemplate(t store.Template) api.Template {
	out := api.Template{
		Id:           formatID(t.ID),
		Name:         t.Name,
		ExpenseItems: make([]api.TemplateExpenseItem, len(t.ExpenseItems)),
		IncomeItems:  make([]api.TemplateIncomeItem, len(t.IncomeItems)),
		CreatedAt:    &t.CreatedAt,
		UpdatedAt:    &t.UpdatedAt,
	}
	for i, it := range t.ExpenseItems {
		out.ExpenseItems[i] = toAPITemplateExpenseItem(it)
	}
	for i, it := range t.IncomeItems {
		out.IncomeItems[i] = toAPITemplateIncomeItem(it)
	}
	return out
}

func toAPITemplateExpenseItem(it store.TemplateExpenseItem) api.TemplateExpenseItem {
	return api.TemplateExpenseItem{
		Id:          formatID(it.ID),
		CategoryId:  formatID(it.CategoryID),
		Merchant:    toAPIMerchant(it.Merchant),
		DayOfMonth:  it.DayOfMonth,
		AmountCents: it.AmountCents,
		Note:        nullableOf(it.Note),
		SortOrder:   it.SortOrder,
	}
}

func toAPITemplateIncomeItem(it store.TemplateIncomeItem) api.TemplateIncomeItem {
	return api.TemplateIncomeItem{
		Id:                formatID(it.ID),
		IncomeSourceId:    formatID(it.SourceID),
		DayOfMonth:        it.DayOfMonth,
		GrossCents:        it.GrossCents,
		GrossTaxableCents: it.GrossTaxableCents,
		NetCents:          it.NetCents,
		Note:              nullableOf(it.Note),
		SortOrder:         it.SortOrder,
	}
}

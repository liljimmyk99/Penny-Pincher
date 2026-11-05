package http

import (
	"context"
	"errors"
	"net/http"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

const (
	msgApplyNotFound = "No such template apply."
	msgMonthNotEmpty = "This month already has entries. Confirm replacing all of them and retry with reset_month."
)

// ApplyTemplateToMonth implements POST /v1/months/{month}/apply-template.
func (s *Server) ApplyTemplateToMonth(ctx context.Context, req api.ApplyTemplateToMonthRequestObject) (api.ApplyTemplateToMonthResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	notFound := api.ApplyTemplateToMonth404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
		newError(api.ErrorErrorCodeNotFound, msgTemplateNotFound))}
	tid, ok := parseID(req.Body.TemplateId)
	if !ok {
		return notFound, nil
	}
	reset := req.Body.ResetMonth != nil && *req.Body.ResetMonth
	r, err := s.months.ApplyTemplate(ctx, uid, req.Month, tid, reset)
	if errors.Is(err, store.ErrMonthNotEmpty) {
		return api.ApplyTemplateToMonth409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(
			newError(api.ErrorErrorCodeMonthNotEmpty, msgMonthNotEmpty))}, nil
	}
	if status, e, ok := templateError(err, msgTemplateNotFound); ok {
		switch status {
		case http.StatusBadRequest:
			return api.ApplyTemplateToMonth400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusNotFound:
			return notFound, nil
		}
	}
	if err != nil {
		return nil, err
	}
	a := toAPITemplateApply(r.TemplateApply)
	return api.ApplyTemplateToMonth201JSONResponse{
		Id:                      a.Id,
		TemplateId:              a.TemplateId,
		TemplateName:            a.TemplateName,
		Month:                   a.Month,
		AppliedAt:               a.AppliedAt,
		CreatedExpenseCount:     a.CreatedExpenseCount,
		CreatedIncomeEntryCount: a.CreatedIncomeEntryCount,
		UnconfirmedCount:        a.UnconfirmedCount,
		RemovedExpenseCount:     r.RemovedExpenseCount,
		RemovedIncomeEntryCount: r.RemovedIncomeEntryCount,
	}, nil
}

// ListTemplateApplies implements GET /v1/template-applies.
func (s *Server) ListTemplateApplies(ctx context.Context, req api.ListTemplateAppliesRequestObject) (api.ListTemplateAppliesResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	as, err := s.months.ListApplies(ctx, uid, req.Params.Month)
	var ve *store.ValidationError
	if errors.As(err, &ve) {
		return api.ListTemplateApplies400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(validationError(ve))}, nil
	}
	if err != nil {
		return nil, err
	}
	out := make([]api.TemplateApply, len(as))
	for i, a := range as {
		out[i] = toAPITemplateApply(a)
	}
	return api.ListTemplateApplies200JSONResponse{Items: out}, nil
}

// UndoTemplateApply implements POST /v1/template-applies/{id}/undo.
func (s *Server) UndoTemplateApply(ctx context.Context, req api.UndoTemplateApplyRequestObject) (api.UndoTemplateApplyResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	notFound := api.UndoTemplateApply404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
		newError(api.ErrorErrorCodeNotFound, msgApplyNotFound))}
	id, ok := parseID(req.Id)
	if !ok {
		return notFound, nil
	}
	exp, inc, err := s.months.Undo(ctx, uid, id)
	if errors.Is(err, store.ErrNotFound) {
		return notFound, nil
	}
	if err != nil {
		return nil, err
	}
	return api.UndoTemplateApply200JSONResponse{RemovedExpenseCount: exp, RemovedIncomeEntryCount: inc}, nil
}

// ConfirmAllInMonth implements POST /v1/months/{month}/confirm-all.
func (s *Server) ConfirmAllInMonth(ctx context.Context, req api.ConfirmAllInMonthRequestObject) (api.ConfirmAllInMonthResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	exp, inc, err := s.months.ConfirmAll(ctx, uid, req.Month)
	var ve *store.ValidationError
	if errors.As(err, &ve) {
		return api.ConfirmAllInMonth400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(validationError(ve))}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.ConfirmAllInMonth200JSONResponse{ConfirmedExpenseCount: exp, ConfirmedIncomeEntryCount: inc}, nil
}

// SaveMonthAsTemplate implements POST /v1/months/{month}/save-as-template.
func (s *Server) SaveMonthAsTemplate(ctx context.Context, req api.SaveMonthAsTemplateRequestObject) (api.SaveMonthAsTemplateResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	t, err := s.months.SaveAsTemplate(ctx, uid, req.Month, req.Body.Name)
	if status, e, ok := templateError(err, msgTemplateNotFound); ok {
		switch status {
		case http.StatusBadRequest:
			return api.SaveMonthAsTemplate400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusConflict:
			return api.SaveMonthAsTemplate409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.SaveMonthAsTemplate201JSONResponse(toAPITemplate(t)), nil
}

func toAPITemplateApply(a store.TemplateApply) api.TemplateApply {
	var tid *string
	if a.TemplateID != nil {
		s := formatID(*a.TemplateID)
		tid = &s
	}
	return api.TemplateApply{
		Id:                      formatID(a.ID),
		TemplateId:              nullableOf(tid),
		TemplateName:            nullableOf(a.TemplateName),
		Month:                   a.Month,
		AppliedAt:               &a.AppliedAt,
		CreatedExpenseCount:     &a.ExpenseCount,
		CreatedIncomeEntryCount: &a.IncomeEntryCount,
		UnconfirmedCount:        &a.UnconfirmedCount,
	}
}

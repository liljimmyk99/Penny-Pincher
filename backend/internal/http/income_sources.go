package http

import (
	"context"
	"errors"
	"net/http"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

const (
	msgIncomeSourceNotFound   = "No such income source."
	msgIncomeSourceProtected  = `The "Other" income source can't be renamed or deleted.`
	msgIncomeSourceNameTaken  = "An income source with this name already exists."
	msgIncomeSourceHasEntries = "This income source has income entries and cannot be deleted. Rename it instead."
)

// ListIncomeSources implements GET /v1/income-sources.
func (s *Server) ListIncomeSources(ctx context.Context, _ api.ListIncomeSourcesRequestObject) (api.ListIncomeSourcesResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	srcs, err := s.incomeSources.List(ctx, uid)
	if err != nil {
		return nil, err
	}
	return api.ListIncomeSources200JSONResponse{Items: toAPIIncomeSources(srcs)}, nil
}

// CreateIncomeSource implements POST /v1/income-sources.
func (s *Server) CreateIncomeSource(ctx context.Context, req api.CreateIncomeSourceRequestObject) (api.CreateIncomeSourceResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	src, err := s.incomeSources.Create(ctx, uid, req.Body.Name)
	if status, e, ok := incomeSourceError(err); ok {
		switch status {
		case http.StatusBadRequest:
			return api.CreateIncomeSource400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusConflict:
			return api.CreateIncomeSource409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.CreateIncomeSource201JSONResponse(toAPIIncomeSource(src)), nil
}

// UpdateIncomeSource implements PATCH /v1/income-sources/{id} (rename).
func (s *Server) UpdateIncomeSource(ctx context.Context, req api.UpdateIncomeSourceRequestObject) (api.UpdateIncomeSourceResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	id, ok := parseID(req.Id)
	if !ok {
		return api.UpdateIncomeSource404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, msgIncomeSourceNotFound))}, nil
	}
	src, err := s.incomeSources.Rename(ctx, uid, id, req.Body.Name)
	if status, e, ok := incomeSourceError(err); ok {
		switch status {
		case http.StatusBadRequest:
			return api.UpdateIncomeSource400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusNotFound:
			return api.UpdateIncomeSource404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(e)}, nil
		case http.StatusConflict:
			return api.UpdateIncomeSource409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.UpdateIncomeSource200JSONResponse(toAPIIncomeSource(src)), nil
}

// ReorderIncomeSources implements PUT /v1/income-sources/order.
func (s *Server) ReorderIncomeSources(ctx context.Context, req api.ReorderIncomeSourcesRequestObject) (api.ReorderIncomeSourcesResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	ids := make([]int64, len(req.Body.Ids))
	for i, raw := range req.Body.Ids {
		if ids[i], ok = parseID(raw); !ok {
			ids[i] = 0 // never a real id, so the store rejects the list
		}
	}
	srcs, err := s.incomeSources.Reorder(ctx, uid, ids)
	if status, e, ok := incomeSourceError(err); ok && status == http.StatusBadRequest {
		return api.ReorderIncomeSources400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.ReorderIncomeSources200JSONResponse{Items: toAPIIncomeSources(srcs)}, nil
}

// DeleteIncomeSource implements DELETE /v1/income-sources/{id}.
func (s *Server) DeleteIncomeSource(ctx context.Context, req api.DeleteIncomeSourceRequestObject) (api.DeleteIncomeSourceResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	id, ok := parseID(req.Id)
	if !ok {
		return api.DeleteIncomeSource404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, msgIncomeSourceNotFound))}, nil
	}
	err := s.incomeSources.Delete(ctx, uid, id)
	if status, e, ok := incomeSourceError(err); ok {
		switch status {
		case http.StatusNotFound:
			return api.DeleteIncomeSource404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(e)}, nil
		case http.StatusConflict:
			return api.DeleteIncomeSource409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.DeleteIncomeSource204Response{}, nil
}

// incomeSourceError maps a store error to an HTTP status and error body. ok is
// false for nil and for unexpected errors, which become 500.
func incomeSourceError(err error) (int, api.Error, bool) {
	var ve *store.ValidationError
	switch {
	case err == nil:
		return 0, api.Error{}, false
	case errors.As(err, &ve):
		return http.StatusBadRequest, validationError(ve), true
	case errors.Is(err, store.ErrNotFound):
		return http.StatusNotFound, newError(api.ErrorErrorCodeNotFound, msgIncomeSourceNotFound), true
	case errors.Is(err, store.ErrProtected):
		return http.StatusConflict, newError(api.ErrorErrorCodeProtectedResource, msgIncomeSourceProtected), true
	case errors.Is(err, store.ErrSourceHasEntries):
		return http.StatusConflict, newError(api.ErrorErrorCodeSourceHasEntries, msgIncomeSourceHasEntries), true
	case errors.Is(err, store.ErrNameTaken):
		return http.StatusConflict, newError(api.ErrorErrorCodeNameTaken, msgIncomeSourceNameTaken), true
	}
	return 0, api.Error{}, false
}

func toAPIIncomeSources(srcs []store.IncomeSource) []api.IncomeSource {
	out := make([]api.IncomeSource, len(srcs))
	for i, src := range srcs {
		out[i] = toAPIIncomeSource(src)
	}
	return out
}

func toAPIIncomeSource(src store.IncomeSource) api.IncomeSource {
	return api.IncomeSource{
		Id:          formatID(src.ID),
		Name:        src.Name,
		IsProtected: &src.IsProtected,
		HasEntries:  &src.HasEntries,
		SortOrder:   src.SortOrder,
		CreatedAt:   &src.CreatedAt,
		UpdatedAt:   &src.UpdatedAt,
	}
}

package http

import (
	"context"
	"errors"
	"net/http"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

var errNoIdentity = errors.New("no authenticated user on a /v1 route")

const (
	msgCategoryNotFound  = "No such category."
	msgCategoryProtected = `The "Other" category can't be renamed, changed or deleted. It can only be recolored and reordered.`
	msgCategoryNameTaken = "A category with this name already exists."
)

// ListCategories implements GET /v1/categories.
func (s *Server) ListCategories(ctx context.Context, _ api.ListCategoriesRequestObject) (api.ListCategoriesResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	cats, err := s.categories.List(ctx, uid)
	if err != nil {
		return nil, err
	}
	return api.ListCategories200JSONResponse{Items: toAPICategories(cats)}, nil
}

// CreateCategory implements POST /v1/categories.
func (s *Server) CreateCategory(ctx context.Context, req api.CreateCategoryRequestObject) (api.CreateCategoryResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	in := store.NewCategory{Name: req.Body.Name, Color: ptrOf(req.Body.Color)}
	if req.Body.IsSaving != nil {
		in.IsSaving = *req.Body.IsSaving
	}
	cat, err := s.categories.Create(ctx, uid, in)
	if status, e, ok := categoryError(err); ok {
		switch status {
		case http.StatusBadRequest:
			return api.CreateCategory400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusConflict:
			return api.CreateCategory409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.CreateCategory201JSONResponse(toAPICategory(cat)), nil
}

// UpdateCategory implements PATCH /v1/categories/{id}.
func (s *Server) UpdateCategory(ctx context.Context, req api.UpdateCategoryRequestObject) (api.UpdateCategoryResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	id, ok := parseID(req.Id)
	if !ok {
		return api.UpdateCategory404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, msgCategoryNotFound))}, nil
	}
	p := store.CategoryPatch{Name: req.Body.Name, IsSaving: req.Body.IsSaving}
	if req.Body.Color.IsSpecified() { // sent, possibly as null to clear it
		p.SetColor = true
		p.Color = ptrOf(req.Body.Color)
	}
	cat, err := s.categories.Update(ctx, uid, id, p)
	if status, e, ok := categoryError(err); ok {
		switch status {
		case http.StatusBadRequest:
			return api.UpdateCategory400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusNotFound:
			return api.UpdateCategory404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(e)}, nil
		case http.StatusConflict:
			return api.UpdateCategory409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.UpdateCategory200JSONResponse(toAPICategory(cat)), nil
}

// ReorderCategories implements PUT /v1/categories/order.
func (s *Server) ReorderCategories(ctx context.Context, req api.ReorderCategoriesRequestObject) (api.ReorderCategoriesResponseObject, error) {
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
	cats, err := s.categories.Reorder(ctx, uid, ids)
	if status, e, ok := categoryError(err); ok && status == http.StatusBadRequest {
		return api.ReorderCategories400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.ReorderCategories200JSONResponse{Items: toAPICategories(cats)}, nil
}

// DeleteCategory implements DELETE /v1/categories/{id}.
func (s *Server) DeleteCategory(ctx context.Context, req api.DeleteCategoryRequestObject) (api.DeleteCategoryResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	id, ok := parseID(req.Id)
	if !ok {
		return api.DeleteCategory404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, msgCategoryNotFound))}, nil
	}
	err := s.categories.Delete(ctx, uid, id)
	if status, e, ok := categoryError(err); ok {
		switch status {
		case http.StatusNotFound:
			return api.DeleteCategory404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(e)}, nil
		case http.StatusConflict:
			return api.DeleteCategory409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.DeleteCategory204Response{}, nil
}

// categoryError maps a store error to an HTTP status and error body. ok is
// false for nil and for unexpected errors, which become 500.
func categoryError(err error) (int, api.Error, bool) {
	var ve *store.ValidationError
	switch {
	case err == nil:
		return 0, api.Error{}, false
	case errors.As(err, &ve):
		return http.StatusBadRequest, validationError(ve), true
	case errors.Is(err, store.ErrNotFound):
		return http.StatusNotFound, newError(api.ErrorErrorCodeNotFound, msgCategoryNotFound), true
	case errors.Is(err, store.ErrProtected):
		return http.StatusConflict, newError(api.ErrorErrorCodeProtectedResource, msgCategoryProtected), true
	case errors.Is(err, store.ErrNameTaken):
		return http.StatusConflict, newError(api.ErrorErrorCodeNameTaken, msgCategoryNameTaken), true
	}
	return 0, api.Error{}, false
}

func toAPICategories(cats []store.Category) []api.Category {
	out := make([]api.Category, len(cats))
	for i, c := range cats {
		out[i] = toAPICategory(c)
	}
	return out
}

func toAPICategory(c store.Category) api.Category {
	return api.Category{
		Id:          formatID(c.ID),
		Name:        c.Name,
		Color:       nullableOf(c.Color),
		IsSaving:    c.IsSaving,
		IsProtected: &c.IsProtected,
		SortOrder:   c.SortOrder,
		CreatedAt:   &c.CreatedAt,
		UpdatedAt:   &c.UpdatedAt,
	}
}

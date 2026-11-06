package http

import (
	"context"
	"errors"
	"net/http"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

const (
	msgSavedTrendNotFound  = "No such saved trend."
	msgSavedTrendNameTaken = "A saved trend with this name already exists."
)

// GetCustomTrend implements GET /v1/trends/custom.
func (s *Server) GetCustomTrend(ctx context.Context, req api.GetCustomTrendRequestObject) (api.GetCustomTrendResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	p := req.Params
	f := store.TrendFilter{From: dateString(p.From), To: dateString(p.To)}
	if p.CategoryId != nil {
		id := idOrZero(*p.CategoryId)
		f.CategoryID = &id
	}
	if p.MerchantId != nil {
		id := idOrZero(*p.MerchantId)
		f.MerchantID = &id
	}
	if p.Text != nil {
		f.Text = *p.Text
	}
	if p.GroupBy != nil {
		f.GroupBy = string(*p.GroupBy)
	}
	tr, err := s.trends.Custom(ctx, uid, f)
	if status, e, ok := trendError(err); ok && status == http.StatusBadRequest {
		return api.GetCustomTrend400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}
	var out api.CustomTrend
	out.GroupBy = api.CustomTrendGroupBy(tr.GroupBy)
	out.Buckets = sized(out.Buckets, len(tr.Buckets))
	for i, b := range tr.Buckets {
		out.Buckets[i].Period = b.Period
		out.Buckets[i].TotalCents = b.TotalCents
		out.Buckets[i].Count = b.Count
	}
	return api.GetCustomTrend200JSONResponse(out), nil
}

// ListSavedTrends implements GET /v1/saved-trends.
func (s *Server) ListSavedTrends(ctx context.Context, _ api.ListSavedTrendsRequestObject) (api.ListSavedTrendsResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	items, err := s.savedTrends.List(ctx, uid)
	if err != nil {
		return nil, err
	}
	out := make([]api.SavedTrend, len(items))
	for i, st := range items {
		out[i] = toAPISavedTrend(st)
	}
	return api.ListSavedTrends200JSONResponse{Items: out}, nil
}

// CreateSavedTrend implements POST /v1/saved-trends.
func (s *Server) CreateSavedTrend(ctx context.Context, req api.CreateSavedTrendRequestObject) (api.CreateSavedTrendResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	b := req.Body
	in := store.NewSavedTrend{
		Name: b.Name, MatchType: string(b.MatchType), MatchText: b.MatchText,
		Measure: string(b.Measure), SortOrder: b.SortOrder,
	}
	if b.MerchantId != nil {
		id := idOrZero(*b.MerchantId)
		in.MerchantID = &id
	}
	if b.CategoryId != nil {
		id := idOrZero(*b.CategoryId)
		in.CategoryID = &id
	}
	st, err := s.savedTrends.Create(ctx, uid, in)
	if status, e, ok := trendError(err); ok {
		switch status {
		case http.StatusBadRequest:
			return api.CreateSavedTrend400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusConflict:
			return api.CreateSavedTrend409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.CreateSavedTrend201JSONResponse(toAPISavedTrend(st)), nil
}

// GetSavedTrend implements GET /v1/saved-trends/{id}.
func (s *Server) GetSavedTrend(ctx context.Context, req api.GetSavedTrendRequestObject) (api.GetSavedTrendResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	id, _ := parseID(req.Id)
	st, err := s.savedTrends.Get(ctx, uid, id)
	if errors.Is(err, store.ErrNotFound) {
		return api.GetSavedTrend404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, msgSavedTrendNotFound))}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.GetSavedTrend200JSONResponse(toAPISavedTrend(st)), nil
}

// UpdateSavedTrend implements PATCH /v1/saved-trends/{id}.
func (s *Server) UpdateSavedTrend(ctx context.Context, req api.UpdateSavedTrendRequestObject) (api.UpdateSavedTrendResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	id, _ := parseID(req.Id)
	b := req.Body
	p := store.SavedTrendPatch{Name: b.Name, SortOrder: b.SortOrder}
	if b.MatchType != nil {
		t := string(*b.MatchType)
		p.MatchType = &t
	}
	if b.Measure != nil {
		m := string(*b.Measure)
		p.Measure = &m
	}
	if b.MerchantId.IsSpecified() {
		p.SetMerchant = true
		if v := ptrOf(b.MerchantId); v != nil {
			n := idOrZero(*v)
			p.MerchantID = &n
		}
	}
	if b.CategoryId.IsSpecified() {
		p.SetCategory = true
		if v := ptrOf(b.CategoryId); v != nil {
			n := idOrZero(*v)
			p.CategoryID = &n
		}
	}
	if b.MatchText.IsSpecified() {
		p.SetText = true
		p.MatchText = ptrOf(b.MatchText)
	}
	st, err := s.savedTrends.Update(ctx, uid, id, p)
	if status, e, ok := trendError(err); ok {
		switch status {
		case http.StatusBadRequest:
			return api.UpdateSavedTrend400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
		case http.StatusNotFound:
			return api.UpdateSavedTrend404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(e)}, nil
		case http.StatusConflict:
			return api.UpdateSavedTrend409JSONResponse{ConflictJSONResponse: api.ConflictJSONResponse(e)}, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return api.UpdateSavedTrend200JSONResponse(toAPISavedTrend(st)), nil
}

// DeleteSavedTrend implements DELETE /v1/saved-trends/{id}.
func (s *Server) DeleteSavedTrend(ctx context.Context, req api.DeleteSavedTrendRequestObject) (api.DeleteSavedTrendResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	id, _ := parseID(req.Id)
	err := s.savedTrends.Delete(ctx, uid, id)
	if errors.Is(err, store.ErrNotFound) {
		return api.DeleteSavedTrend404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse(
			newError(api.ErrorErrorCodeNotFound, msgSavedTrendNotFound))}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.DeleteSavedTrend204Response{}, nil
}

// trendError maps a store error to an HTTP status and body; ok is false for
// nil and unexpected errors (500).
func trendError(err error) (int, api.Error, bool) {
	var ve *store.ValidationError
	switch {
	case err == nil:
		return 0, api.Error{}, false
	case errors.As(err, &ve):
		return http.StatusBadRequest, validationError(ve), true
	case errors.Is(err, store.ErrNotFound):
		return http.StatusNotFound, newError(api.ErrorErrorCodeNotFound, msgSavedTrendNotFound), true
	case errors.Is(err, store.ErrNameTaken):
		return http.StatusConflict, newError(api.ErrorErrorCodeNameTaken, msgSavedTrendNameTaken), true
	}
	return 0, api.Error{}, false
}

func toAPISavedTrend(st store.SavedTrend) api.SavedTrend {
	out := api.SavedTrend{
		Id: formatID(st.ID), Name: st.Name, MatchType: api.TrendMatchType(st.MatchType),
		MatchText: nullableOf(st.MatchText), Measure: api.TrendMeasure(st.Measure),
		SortOrder: st.SortOrder, CreatedAt: &st.CreatedAt, UpdatedAt: &st.UpdatedAt,
	}
	var m, c *string
	if st.MerchantID != nil {
		v := formatID(*st.MerchantID)
		m = &v
	}
	if st.CategoryID != nil {
		v := formatID(*st.CategoryID)
		c = &v
	}
	out.MerchantId, out.CategoryId = nullableOf(m), nullableOf(c)
	return out
}

// GetCategoryTrends implements GET /v1/trends/by-category.
func (s *Server) GetCategoryTrends(ctx context.Context, req api.GetCategoryTrendsRequestObject) (api.GetCategoryTrendsResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	tr, err := s.trends.ByCategory(ctx, uid, req.Params.Year)
	if status, e, ok := trendError(err); ok && status == http.StatusBadRequest {
		return api.GetCategoryTrends400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}
	out := api.CategoryTrends{
		Year:        tr.Year,
		AllSpending: toAPICategorySeries(tr.AllSpending),
		Categories:  make([]api.CategoryTrendSeries, len(tr.Categories)),
	}
	for i, c := range tr.Categories {
		out.Categories[i] = toAPICategorySeries(c)
	}
	return api.GetCategoryTrends200JSONResponse(out), nil
}

func toAPICategorySeries(c store.CategorySeries) api.CategoryTrendSeries {
	out := api.CategoryTrendSeries{
		Name: c.Name, Color: nullableOf(c.Color), IsSaving: c.IsSaving,
		ThisYearCents: c.ThisYearCents[:], LastYearCents: c.LastYearCents[:],
	}
	if c.CategoryID != nil {
		out.CategoryId = nullableOf(ptrOf2(formatID(*c.CategoryID)))
	} else {
		out.CategoryId = nullableOf[string](nil)
	}
	return out
}

func ptrOf2[T any](v T) *T { return &v }

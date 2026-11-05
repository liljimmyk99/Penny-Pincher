package http

import (
	"context"
	"net/http"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

// ListCategoryStats implements GET /v1/categories/stats.
func (s *Server) ListCategoryStats(ctx context.Context, req api.ListCategoryStatsRequestObject) (api.ListCategoryStatsResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	stats, err := s.categories.Stats(ctx, uid, req.Params.Year)
	if status, e, ok := categoryError(err); ok && status == http.StatusBadRequest {
		return api.ListCategoryStats400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}
	items := make([]api.CategoryStats, len(stats))
	for i, st := range stats {
		items[i] = api.CategoryStats{
			CategoryId:     formatID(st.CategoryID),
			EntryCount:     st.EntryCount,
			TotalCents:     st.TotalCents,
			YearTotalCents: st.YearTotalCents,
		}
	}
	return api.ListCategoryStats200JSONResponse{Items: items}, nil
}

// ListIncomeSourceStats implements GET /v1/income-sources/stats.
func (s *Server) ListIncomeSourceStats(ctx context.Context, req api.ListIncomeSourceStatsRequestObject) (api.ListIncomeSourceStatsResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	stats, err := s.incomeSources.Stats(ctx, uid, req.Params.Year)
	if status, e, ok := incomeSourceError(err); ok && status == http.StatusBadRequest {
		return api.ListIncomeSourceStats400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}
	items := make([]api.IncomeSourceStats, len(stats))
	for i, st := range stats {
		items[i] = api.IncomeSourceStats{
			IncomeSourceId:        formatID(st.IncomeSourceID),
			EntryCount:            st.EntryCount,
			YearGrossCents:        st.YearGrossCents,
			YearGrossTaxableCents: st.YearGrossTaxableCents,
			YearNetCents:          st.YearNetCents,
		}
	}
	return api.ListIncomeSourceStats200JSONResponse{Items: items}, nil
}

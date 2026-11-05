package http

import (
	"context"
	"net/http"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

// ListMerchants implements GET /v1/merchants: autocomplete when q is given.
func (s *Server) ListMerchants(ctx context.Context, req api.ListMerchantsRequestObject) (api.ListMerchantsResponseObject, error) {
	uid, ok := userID(ctx)
	if !ok {
		return nil, errNoIdentity
	}
	prefix := ""
	if req.Params.Q != nil {
		prefix = *req.Params.Q
	}
	mers, next, err := s.merchants.List(ctx, uid, prefix, pageOf(req.Params.Limit, req.Params.Cursor))
	if status, e, ok := expenseError(err); ok && status == http.StatusBadRequest {
		return api.ListMerchants400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(e)}, nil
	}
	if err != nil {
		return nil, err
	}
	out := make([]api.Merchant, len(mers))
	for i, m := range mers {
		out[i] = toAPIMerchant(m)
	}
	return api.ListMerchants200JSONResponse{Items: out, NextCursor: cursorOf(next)}, nil
}

func toAPIMerchant(m store.Merchant) api.Merchant {
	return api.Merchant{Id: formatID(m.ID), Name: m.Name}
}

package http

import (
	"context"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/auth"
)

// GetMe implements GET /v1/me. The auth middleware has already put the
// identity in the context; the 401 is a defensive fallback.
func (s *Server) GetMe(ctx context.Context, _ api.GetMeRequestObject) (api.GetMeResponseObject, error) {
	id, ok := auth.FromContext(ctx)
	if !ok {
		return api.GetMe401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse(
			newError(api.ErrorErrorCodeUnauthenticated, "Missing, expired or invalid token."))}, nil
	}
	return api.GetMe200JSONResponse{
		Id:          id.ID,
		Email:       nullableOf(id.Email),
		DisplayName: nullableOf(id.DisplayName),
		Role:        api.MeRole(id.Role),
	}, nil
}

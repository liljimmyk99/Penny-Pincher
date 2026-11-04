package http

import (
	"context"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

// Pinger checks that the database is reachable.
type Pinger interface {
	PingContext(ctx context.Context) error
}

// GetHealth implements GET /healthz.
func (s *Server) GetHealth(ctx context.Context, _ api.GetHealthRequestObject) (api.GetHealthResponseObject, error) {
	h := api.Health{
		Status:        api.HealthStatusOk,
		Version:       s.version,
		UptimeSeconds: int(s.now().Sub(s.start).Seconds()),
	}
	if s.db != nil {
		ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		if err := s.db.PingContext(ctx); err != nil {
			h.Status = api.HealthStatusDegraded
			return api.GetHealth503JSONResponse(h), nil
		}
	}
	return api.GetHealth200JSONResponse(h), nil
}

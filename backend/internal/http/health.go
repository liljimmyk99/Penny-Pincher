// Package http holds handlers, routing and request/response types.
package http

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

// Pinger checks that the database is reachable.
type Pinger interface {
	PingContext(ctx context.Context) error
}

// Health matches the OpenAPI Health schema.
type Health struct {
	Status        string `json:"status"`
	Version       string `json:"version"`
	UptimeSeconds int64  `json:"uptime_seconds"`
}

// NewRouter builds the API router. db may be nil until the store is wired.
func NewRouter(version string, db Pinger, now func() time.Time) http.Handler {
	start := now()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		h := Health{Status: "ok", Version: version, UptimeSeconds: int64(now().Sub(start).Seconds())}
		code := http.StatusOK
		if db != nil {
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()
			if err := db.PingContext(ctx); err != nil {
				h.Status, code = "degraded", http.StatusServiceUnavailable
			}
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(h)
	})
	return mux
}

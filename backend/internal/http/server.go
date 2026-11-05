// Package http holds the server that implements the generated API interface.
package http

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

// Server implements api.StrictServerInterface. Operations not built yet fall
// through to api.Unimplemented and answer 501.
type Server struct {
	api.Unimplemented

	version string
	db      Pinger
	now     func() time.Time
	start   time.Time
}

var _ api.StrictServerInterface = (*Server)(nil)

// NewRouter builds the API router. authn (auth.Middleware) wraps every route;
// it must not be nil. db may be nil until the store is wired.
func NewRouter(version string, db Pinger, now func() time.Time, authn func(http.Handler) http.Handler) http.Handler {
	s := &Server{version: version, db: db, now: now, start: now()}
	strict := api.NewStrictHandlerWithOptions(s, nil, api.StrictHTTPServerOptions{
		RequestErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, err error) {
			writeError(w, http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest, "The request is malformed.")
		},
		ResponseErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, err error) {
			if errors.Is(err, api.ErrNotImplemented) {
				writeError(w, http.StatusNotImplemented, api.ErrorErrorCodeNotImplemented, "This endpoint is not implemented yet.")
				return
			}
			slog.Error("handler failed", "err_type", errType(err)) // never log err text: it may carry data
			writeError(w, http.StatusInternalServerError, api.ErrorErrorCodeInternal, "Something went wrong.")
		},
	})
	return authn(api.HandlerWithOptions(strict, api.StdHTTPServerOptions{
		ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, err error) {
			writeError(w, http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest, "The request is malformed.")
		},
	}))
}

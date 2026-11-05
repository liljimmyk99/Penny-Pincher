// Package http holds the server that implements the generated API interface.
package http

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

// Server implements api.StrictServerInterface. Operations not built yet fall
// through to api.Unimplemented and answer 501.
type Server struct {
	api.Unimplemented

	version       string
	db            Pinger
	categories    store.Categories
	incomeSources store.IncomeSources
	incomeEntries store.IncomeEntries
	now           func() time.Time
	start         time.Time
}

// Deps are the router's dependencies.
type Deps struct {
	Version string
	// DB is pinged by /healthz; nil skips the check.
	DB Pinger
	// Data is the database the store queries.
	Data *sql.DB
	Now  func() time.Time
	// Authn (auth.Middleware) wraps every route; it must not be nil.
	Authn func(http.Handler) http.Handler
}

var _ api.StrictServerInterface = (*Server)(nil)

// NewRouter builds the API router.
func NewRouter(d Deps) http.Handler {
	s := &Server{
		version:       d.Version,
		db:            d.DB,
		categories:    store.Categories{DB: d.Data},
		incomeSources: store.IncomeSources{DB: d.Data},
		incomeEntries: store.IncomeEntries{DB: d.Data},
		now:           d.Now,
		start:         d.Now(),
	}
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
	return d.Authn(api.HandlerWithOptions(strict, api.StdHTTPServerOptions{
		ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, err error) {
			writeError(w, http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest, "The request is malformed.")
		},
	}))
}

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
	expenses      store.Expenses
	merchants     store.Merchants
	templates     store.Templates
	months        store.Months
	summaries     store.Summaries
	trends        store.Trends
	savedTrends   store.SavedTrends
	admin         store.Admin
	export        store.Export
	backups       Backups
	authCheck     AuthCheck
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
	// Backups serves the admin backup routes; nil when backups are not configured.
	Backups Backups
	// AuthCheck probes the sign-in provider for the admin status; nil reports ok.
	AuthCheck AuthCheck
	// Authn (auth.Middleware) wraps every route; it must not be nil.
	Authn func(http.Handler) http.Handler
	// Limits are the rate limits; nil turns them off. Body caps and write
	// deadlines always apply.
	Limits *Limits
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
		expenses:      store.Expenses{DB: d.Data},
		merchants:     store.Merchants{DB: d.Data},
		templates:     store.Templates{DB: d.Data},
		months:        store.Months{DB: d.Data},
		summaries:     store.Summaries{DB: d.Data},
		trends:        store.Trends{DB: d.Data},
		savedTrends:   store.SavedTrends{DB: d.Data},
		admin:         store.Admin{DB: d.Data},
		export:        store.Export{DB: d.Data},
		backups:       d.Backups,
		authCheck:     d.AuthCheck,
		now:           d.Now,
		start:         d.Now(),
	}
	strict := api.NewStrictHandlerWithOptions(s, nil, api.StrictHTTPServerOptions{
		RequestErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
			if isTooLarge(err) {
				writeTooLarge(w, r)
				return
			}
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
	lim := newLimiters(d.Limits, d.Now)
	return lim.edge(d.Authn(lim.perUser(api.HandlerWithOptions(strict, api.StdHTTPServerOptions{
		ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, err error) {
			writeError(w, http.StatusBadRequest, api.ErrorErrorCodeInvalidRequest, "The request is malformed.")
		},
	}))))
}

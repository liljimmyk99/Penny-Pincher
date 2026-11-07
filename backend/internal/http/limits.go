package http

import (
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/auth"
	"github.com/liljimmyk99/penny-pincher/backend/internal/clientip"
	"github.com/liljimmyk99/penny-pincher/backend/internal/ratelimit"
)

// Request body caps (AGENTS.md section 8, docs/security.md). The import upload
// allows a 10 MB file plus multipart overhead. The proxy's own cap
// (deploy/Caddyfile) is a little higher, so the API's JSON 413 is what
// clients normally see.
const (
	maxBody       int64 = 1 << 20
	maxImportBody int64 = 11 << 20
)

// writeTimeout is the write deadline for ordinary responses. Streaming routes
// (SSE progress, backup download, export) get none. A var so tests can shorten it.
var writeTimeout = 30 * time.Second

// Limits are the rate limits. A nil *Limits in Deps turns rate limiting off
// (the handler tests make many requests); main always passes DefaultLimits.
type Limits struct {
	// PerIP applies to every request, before the token is verified.
	PerIP ratelimit.Rule
	// PerUser applies to every authenticated request.
	PerUser ratelimit.Rule
	// Expensive applies per user, on top of PerUser, to expensiveRoute.
	Expensive ratelimit.Rule
}

// DefaultLimits leave room for a page that fires a dozen queries at once.
var DefaultLimits = Limits{
	PerIP:     ratelimit.Rule{Rate: 20, Burst: 40},
	PerUser:   ratelimit.Rule{Rate: 10, Burst: 60},
	Expensive: ratelimit.Rule{Rate: 1.0 / 10, Burst: 5},
}

const limiterIdle = 10 * time.Minute

type limiters struct {
	ip, user, expensive *ratelimit.Limiter
	now                 func() time.Time
}

func newLimiters(l *Limits, now func() time.Time) *limiters {
	if l == nil {
		return nil
	}
	return &limiters{
		ip:        ratelimit.New(l.PerIP, limiterIdle),
		user:      ratelimit.New(l.PerUser, limiterIdle),
		expensive: ratelimit.New(l.Expensive, limiterIdle),
		now:       now,
	}
}

func isImportUpload(r *http.Request) bool {
	return r.Method == http.MethodPost && r.URL.Path == "/v1/imports"
}

// expensiveRoute: back up now, import upload and export.
func expensiveRoute(r *http.Request) bool {
	return isImportUpload(r) ||
		(r.Method == http.MethodPost && r.URL.Path == "/v1/admin/backups") ||
		(r.Method == http.MethodGet && r.URL.Path == "/v1/export")
}

// streamingRoute: responses that can take minutes to write.
func streamingRoute(r *http.Request) bool {
	if r.Method != http.MethodGet {
		return false
	}
	p := r.URL.Path
	return p == "/v1/export" ||
		(strings.HasPrefix(p, "/v1/imports/") && strings.HasSuffix(p, "/events")) ||
		(strings.HasPrefix(p, "/v1/admin/backups/") && strings.HasSuffix(p, "/download"))
}

// edge runs before authentication: it sets the connection deadlines for the
// route, rejects oversized bodies, and applies the per-IP limit (so a flood
// of bad tokens is refused before any is verified).
func (l *limiters) edge(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		setDeadlines(w, r)
		limit := maxBody
		if isImportUpload(r) {
			limit = maxImportBody
		}
		if r.ContentLength > limit {
			writeTooLarge(w, r)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		if l != nil && !l.allow(w, l.ip, clientip.From(r)) {
			return
		}
		next.ServeHTTP(w, r)
	})
}

// perUser runs after authentication, keyed by the local user id.
func (l *limiters) perUser(next http.Handler) http.Handler {
	if l == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if id, ok := auth.FromContext(r.Context()); ok {
			if !l.allow(w, l.user, id.ID) {
				return
			}
			if expensiveRoute(r) && !l.allow(w, l.expensive, id.ID) {
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// allow takes a token or answers 429 with Retry-After in whole seconds.
func (l *limiters) allow(w http.ResponseWriter, lim *ratelimit.Limiter, key string) bool {
	ok, wait := lim.Allow(key, l.now())
	if ok {
		return true
	}
	secs := max(1, int(math.Ceil(wait.Seconds())))
	w.Header().Set("Retry-After", strconv.Itoa(secs))
	writeError(w, http.StatusTooManyRequests, api.ErrorErrorCodeRateLimited, "Too many requests. Try again in a moment.")
	return false
}

// setDeadlines sets a write deadline per request instead of a server-wide
// WriteTimeout, which would cut off SSE and downloads. Streaming routes clear
// both deadlines: the connection may carry a stale one from an earlier request,
// and an expired read deadline would cancel the request's context. Errors are
// ignored: test recorders don't support deadlines.
func setDeadlines(w http.ResponseWriter, r *http.Request) {
	rc := http.NewResponseController(w)
	if streamingRoute(r) {
		_ = rc.SetWriteDeadline(time.Time{})
		_ = rc.SetReadDeadline(time.Time{})
		return
	}
	_ = rc.SetWriteDeadline(time.Now().Add(writeTimeout))
}

func writeTooLarge(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Connection", "close")
	if isImportUpload(r) {
		writeError(w, http.StatusRequestEntityTooLarge, api.ErrorErrorCodeFileTooLarge, "The file is larger than 10 MB.")
		return
	}
	writeError(w, http.StatusRequestEntityTooLarge, api.ErrorErrorCodeRequestTooLarge, "The request is too large.")
}

// isTooLarge reports whether reading the body hit the MaxBytesReader cap
// (a body sent without Content-Length, or one that lied about it).
func isTooLarge(err error) bool {
	var mbe *http.MaxBytesError
	return errors.As(err, &mbe)
}

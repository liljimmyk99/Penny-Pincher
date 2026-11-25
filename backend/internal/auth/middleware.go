package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/clientip"
	"github.com/liljimmyk99/penny-pincher/backend/internal/logging"
)

// Errors a SessionLookup returns.
var (
	// ErrUnknownSession: no such token (never issued, signed out, or revoked).
	ErrUnknownSession = errors.New("unknown session")
	// ErrSessionExpired: the session is older than MaxSessionAge.
	ErrSessionExpired = errors.New("session expired")
)

// SessionLookup finds the identity for a bearer token. It returns
// ErrUnknownSession or ErrSessionExpired.
type SessionLookup interface {
	Lookup(ctx context.Context, token string) (Identity, error)
}

// MaxSessionAge is how long a sign-in lasts, counted from the session's
// creation (AGENTS.md section 10).
const MaxSessionAge = 30 * 24 * time.Hour

// Middleware authenticates every request except GET /healthz and POST
// /v1/auth/login: it looks up the bearer token (401 unauthenticated, or 401
// session_expired), puts the Identity on the context, requires the admin role
// under /v1/admin/ (403 admin_required), and while the user must choose a new
// password allows only changing it, signing out and GET /v1/me (403
// password_change_required). Every refusal is logged as a security event.
func Middleware(sessions SessionLookup) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/healthz" || (r.Method == http.MethodPost && r.URL.Path == "/v1/auth/login") {
				next.ServeHTTP(w, r)
				return
			}
			tok, ok := bearer(r)
			if !ok {
				logFailure(r, logging.ReasonMissingToken, http.StatusUnauthorized)
				writeErr(w, http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated, "Missing, expired or invalid token.")
				return
			}
			id, err := sessions.Lookup(r.Context(), tok)
			switch {
			case errors.Is(err, ErrUnknownSession):
				logFailure(r, logging.ReasonInvalidToken, http.StatusUnauthorized)
				writeErr(w, http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated, "Missing, expired or invalid token.")
				return
			case errors.Is(err, ErrSessionExpired):
				logFailure(r, logging.ReasonSessionExpired, http.StatusUnauthorized)
				writeErr(w, http.StatusUnauthorized, api.ErrorErrorCodeSessionExpired, "Your session has expired. Please sign in again.")
				return
			case err != nil:
				slog.Error("session lookup failed", "err_type", fmt.Sprintf("%T", err))
				writeErr(w, http.StatusInternalServerError, api.ErrorErrorCodeInternal, "Something went wrong.")
				return
			}
			if id.MustChangePassword && !allowedWhileChangingPassword(r) {
				logFailure(r, logging.ReasonPasswordChangeRequired, http.StatusForbidden, "user_id", id.ID)
				writeErr(w, http.StatusForbidden, api.ErrorErrorCodePasswordChangeRequired, "Choose a new password before continuing.")
				return
			}
			if strings.HasPrefix(r.URL.Path, "/v1/admin/") && id.Role != RoleAdmin {
				logFailure(r, logging.ReasonAdminRequired, http.StatusForbidden, "user_id", id.ID)
				writeErr(w, http.StatusForbidden, api.ErrorErrorCodeAdminRequired, "Admins only.")
				return
			}
			next.ServeHTTP(w, r.WithContext(WithIdentity(r.Context(), id)))
		})
	}
}

func allowedWhileChangingPassword(r *http.Request) bool {
	switch {
	case r.Method == http.MethodPost && (r.URL.Path == "/v1/auth/password" || r.URL.Path == "/v1/auth/logout"):
		return true
	case r.Method == http.MethodGet && r.URL.Path == "/v1/me":
		return true
	}
	return false
}

// LogFailure writes one security-event line for a refused request. It logs
// the path without its query string (which can carry note text) and never the
// token, username or password.
func LogFailure(r *http.Request, reason string, status int, attrs ...any) {
	logFailure(r, reason, status, attrs...)
}

func logFailure(r *http.Request, reason string, status int, attrs ...any) {
	base := []any{
		"event", logging.EventAuthFailure,
		"reason", reason,
		"status", status,
		"ip", clientip.From(r),
		"method", r.Method,
		"path", r.URL.Path,
	}
	slog.Warn("auth failure", append(base, attrs...)...)
}

func bearer(r *http.Request) (string, bool) {
	h := r.Header.Get("Authorization")
	const p = "bearer "
	if len(h) <= len(p) || !strings.EqualFold(h[:len(p)], p) {
		return "", false
	}
	return strings.TrimSpace(h[len(p):]), true
}

func writeErr(w http.ResponseWriter, status int, code api.ErrorErrorCode, msg string) {
	var e api.Error
	e.Error.Code = code
	e.Error.Message = msg
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(e)
}

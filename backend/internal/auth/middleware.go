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

// ErrUnknownUser means the Firebase uid has no row in the users table.
var ErrUnknownUser = errors.New("user not in allowlist")

// UserLookup finds the local user for a Firebase uid (the allowlist).
// It returns ErrUnknownUser when there is none.
type UserLookup interface {
	FindByFirebaseUID(ctx context.Context, uid string) (Identity, error)
}

// MaxSessionAge is how long a sign-in lasts: a token whose auth_time is older
// gets 401 session_expired, and the user must sign in again (AGENTS.md
// section 10).
const MaxSessionAge = 30 * 24 * time.Hour

// Middleware authenticates every request except GET /healthz: it verifies the
// bearer token, including the revocation check (401 unauthenticated), refuses
// a sign-in older than maxAge (401 session_expired), requires the uid to exist
// in the users table (403 not_allowlisted), puts the Identity on the context,
// and requires the admin role under /v1/admin/ (403 admin_required). Every
// refusal is logged as a security event (logging.EventAuthFailure).
func Middleware(v Verifier, users UserLookup, maxAge time.Duration, now func() time.Time) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/healthz" {
				next.ServeHTTP(w, r)
				return
			}
			tok, ok := bearer(r)
			if !ok {
				logFailure(r, logging.ReasonMissingToken, http.StatusUnauthorized)
				writeErr(w, http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated, "Missing, expired or invalid token.")
				return
			}
			claims, err := v.Verify(r.Context(), tok)
			if errors.Is(err, ErrInvalidToken) {
				// The uid of a token that failed verification can't be trusted,
				// so none is logged.
				logFailure(r, logging.ReasonInvalidToken, http.StatusUnauthorized)
				writeErr(w, http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated, "Missing, expired or invalid token.")
				return
			}
			if err != nil {
				slog.Error("token check failed", "err_type", fmt.Sprintf("%T", errors.Unwrap(err)))
				writeErr(w, http.StatusInternalServerError, api.ErrorErrorCodeInternal, "Something went wrong.")
				return
			}
			// A missing auth_time (zero) counts as expired.
			if now().Sub(claims.AuthTime) > maxAge {
				logFailure(r, logging.ReasonSessionExpired, http.StatusUnauthorized, "uid", claims.UID)
				writeErr(w, http.StatusUnauthorized, api.ErrorErrorCodeSessionExpired, "Your session has expired. Please sign in again.")
				return
			}
			id, err := users.FindByFirebaseUID(r.Context(), claims.UID)
			if errors.Is(err, ErrUnknownUser) {
				logFailure(r, logging.ReasonNotAllowlisted, http.StatusForbidden, "uid", claims.UID)
				writeErr(w, http.StatusForbidden, api.ErrorErrorCodeNotAllowlisted, "This account does not have access.")
				return
			}
			if err != nil {
				slog.Error("user lookup failed", "err_type", fmt.Sprintf("%T", err))
				writeErr(w, http.StatusInternalServerError, api.ErrorErrorCodeInternal, "Something went wrong.")
				return
			}
			if strings.HasPrefix(r.URL.Path, "/v1/admin/") && id.Role != RoleAdmin {
				logFailure(r, logging.ReasonAdminRequired, http.StatusForbidden, "uid", claims.UID, "user_id", id.ID)
				writeErr(w, http.StatusForbidden, api.ErrorErrorCodeAdminRequired, "Admins only.")
				return
			}
			next.ServeHTTP(w, r.WithContext(WithIdentity(r.Context(), id)))
		})
	}
}

// logFailure writes one security-event line for a refused request. It logs
// the path without its query string (which can carry note text) and never the
// token.
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

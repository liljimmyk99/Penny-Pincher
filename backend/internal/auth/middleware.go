package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

// ErrUnknownUser means the Firebase uid has no row in the users table.
var ErrUnknownUser = errors.New("user not in allowlist")

// UserLookup finds the local user for a Firebase uid (the allowlist).
// It returns ErrUnknownUser when there is none.
type UserLookup interface {
	FindByFirebaseUID(ctx context.Context, uid string) (Identity, error)
}

// Middleware authenticates every request except GET /healthz: it verifies the
// bearer token (401), requires the uid to exist in the users table (403
// not_allowlisted), puts the Identity on the context, and requires the admin
// role under /v1/admin/ (403 admin_required).
func Middleware(v Verifier, users UserLookup) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/healthz" {
				next.ServeHTTP(w, r)
				return
			}
			tok, ok := bearer(r)
			if !ok {
				writeErr(w, http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated, "Missing, expired or invalid token.")
				return
			}
			claims, err := v.Verify(r.Context(), tok)
			if err != nil {
				writeErr(w, http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated, "Missing, expired or invalid token.")
				return
			}
			id, err := users.FindByFirebaseUID(r.Context(), claims.UID)
			if errors.Is(err, ErrUnknownUser) {
				writeErr(w, http.StatusForbidden, api.ErrorErrorCodeNotAllowlisted, "This account does not have access.")
				return
			}
			if err != nil {
				slog.Error("user lookup failed", "err_type", fmt.Sprintf("%T", err))
				writeErr(w, http.StatusInternalServerError, api.ErrorErrorCodeInternal, "Something went wrong.")
				return
			}
			if strings.HasPrefix(r.URL.Path, "/v1/admin/") && id.Role != RoleAdmin {
				writeErr(w, http.StatusForbidden, api.ErrorErrorCodeAdminRequired, "Admins only.")
				return
			}
			next.ServeHTTP(w, r.WithContext(WithIdentity(r.Context(), id)))
		})
	}
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

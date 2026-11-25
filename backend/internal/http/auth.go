package http

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/auth"
	"github.com/liljimmyk99/penny-pincher/backend/internal/logging"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

const maxLoginUsername = 64

func invalidCredentials() api.Error {
	return newError(api.ErrorErrorCodeInvalidCredentials, "Wrong username or password.")
}

// loginRequest carries the request for security logging; handlers get only the
// context, so the middleware-free login route reads it from the strict
// handler's context via requestFrom.
type requestKey struct{}

// withRequest stores the HTTP request on the context (the login route has no
// identity, so the handler needs the client address for its log line).
func withRequest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestKey{}, r)))
	})
}

func requestFrom(ctx context.Context) *http.Request {
	r, _ := ctx.Value(requestKey{}).(*http.Request)
	return r
}

func logAuthFailure(ctx context.Context, reason string, status int, attrs ...any) {
	if r := requestFrom(ctx); r != nil {
		auth.LogFailure(r, reason, status, attrs...)
	}
}

func (s *Server) loginResult(ctx context.Context, u store.UserAuth) (api.LoginResult, error) {
	token, expires, err := s.sessions.Create(ctx, u.ID)
	if err != nil {
		return api.LoginResult{}, err
	}
	me := toMe(auth.Identity{
		ID: strconv.FormatInt(u.ID, 10), Username: u.Username, Email: u.Email, DisplayName: u.DisplayName,
		Role: auth.Role(u.Role), MustChangePassword: u.MustChangePassword,
	})
	return api.LoginResult{Token: token, ExpiresAt: &expires, User: me, MustChangePassword: u.MustChangePassword}, nil
}

// Login implements POST /v1/auth/login. A wrong password and an unknown
// username get the same answer, and an unknown username still costs one hash,
// so neither the response nor its timing reveals which usernames exist.
func (s *Server) Login(ctx context.Context, req api.LoginRequestObject) (api.LoginResponseObject, error) {
	username := strings.TrimSpace(req.Body.Username)
	password := ""
	if req.Body.Password != nil {
		password = *req.Body.Password
	}
	if username == "" || len(username) > maxLoginUsername || password == "" || len(password) > auth.MaxPasswordLength {
		return api.Login400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(
			validationError(&store.ValidationError{Field: "username", Issue: "and password are required"}))}, nil
	}
	if s.lim != nil {
		if ok, wait := s.lim.login.Allow(strings.ToLower(username), s.now()); !ok {
			secs := max(1, int(wait.Seconds()+0.999))
			logAuthFailure(ctx, logging.ReasonInvalidCredentials, http.StatusTooManyRequests)
			return api.Login429JSONResponse{TooManyRequestsJSONResponse: api.TooManyRequestsJSONResponse{
				Body:    newError(api.ErrorErrorCodeRateLimited, "Too many attempts. Try again in a moment."),
				Headers: api.TooManyRequestsResponseHeaders{RetryAfter: &secs},
			}}, nil
		}
	}
	u, err := store.FindUserByUsername(ctx, s.admin.DB, username)
	switch {
	case errors.Is(err, store.ErrNoUser):
		s.hasher.DummyVerify(password)
		logAuthFailure(ctx, logging.ReasonInvalidCredentials, http.StatusUnauthorized)
		return api.Login401JSONResponse(invalidCredentials()), nil
	case err != nil:
		return nil, err
	}
	if !s.hasher.Verify(password, u.PasswordHash) {
		logAuthFailure(ctx, logging.ReasonInvalidCredentials, http.StatusUnauthorized, "user_id", u.ID)
		return api.Login401JSONResponse(invalidCredentials()), nil
	}
	res, err := s.loginResult(ctx, u)
	if err != nil {
		return nil, err
	}
	return api.Login200JSONResponse(res), nil
}

// Logout implements POST /v1/auth/logout: it signs out this device only.
func (s *Server) Logout(ctx context.Context, _ api.LogoutRequestObject) (api.LogoutResponseObject, error) {
	id, ok := auth.FromContext(ctx)
	if !ok {
		return api.Logout401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse(
			newError(api.ErrorErrorCodeUnauthenticated, "Missing, expired or invalid token."))}, nil
	}
	if err := s.sessions.Revoke(ctx, id.SessionID); err != nil {
		return nil, err
	}
	return api.Logout204Response{}, nil
}

// ChangePassword implements POST /v1/auth/password: it checks the current
// password, stores the new one, signs the user out on every device (this one
// included), clears must_change_password and returns a fresh session.
func (s *Server) ChangePassword(ctx context.Context, req api.ChangePasswordRequestObject) (api.ChangePasswordResponseObject, error) {
	id, ok := auth.FromContext(ctx)
	if !ok {
		return api.ChangePassword401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse(
			newError(api.ErrorErrorCodeUnauthenticated, "Missing, expired or invalid token."))}, nil
	}
	cur, next := "", ""
	if req.Body.CurrentPassword != nil {
		cur = *req.Body.CurrentPassword
	}
	if req.Body.NewPassword != nil {
		next = *req.Body.NewPassword
	}
	if cur == "" || len(cur) > auth.MaxPasswordLength {
		return api.ChangePassword400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(
			validationError(&store.ValidationError{Field: "current_password", Issue: "is required"}))}, nil
	}
	uid, _ := strconv.ParseInt(id.ID, 10, 64)
	u, err := store.FindUserByID(ctx, s.admin.DB, uid)
	if err != nil {
		return nil, err
	}
	if !s.hasher.Verify(cur, u.PasswordHash) {
		logAuthFailure(ctx, logging.ReasonInvalidCredentials, http.StatusUnauthorized, "user_id", id.ID)
		return api.ChangePassword401JSONResponse{UnauthorizedJSONResponse: api.UnauthorizedJSONResponse(invalidCredentials())}, nil
	}
	if issue := auth.CheckPasswordRules(next); issue != "" {
		return api.ChangePassword400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse(weakPasswordError("new_password", issue))}, nil
	}
	hash, err := s.hasher.Hash(next)
	if err != nil {
		return nil, err
	}
	if err := store.SetPassword(ctx, s.admin.DB, uid, hash, false); err != nil {
		return nil, err
	}
	u.MustChangePassword = false
	res, err := s.loginResult(ctx, u)
	if err != nil {
		return nil, err
	}
	return api.ChangePassword200JSONResponse(res), nil
}

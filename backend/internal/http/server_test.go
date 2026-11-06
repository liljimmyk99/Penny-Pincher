package http

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/auth"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

const (
	tokAdmin  = "tok-admin"
	tokMember = "tok-member"
	tokStray  = "tok-not-in-users" // valid Firebase token, uid not allowlisted
)

// testAPI is a router over a fresh database with an admin and a member,
// each seeded with the default categories like a real new account.
type testAPI struct {
	t  *testing.T
	db *sql.DB
	h  http.Handler
}

func newTestAPI(t *testing.T) *testAPI { return newTestAPIWith(t, nil) }

// newTestAPIWith lets a test adjust the router's dependencies; the database
// is passed in because some dependencies (backups) need it.
func newTestAPIWith(t *testing.T, tweak func(*sql.DB, *Deps)) *testAPI {
	t.Helper()
	db := store.NewTestDB(t)
	for _, u := range [][2]string{{"uid-admin", "admin"}, {"uid-member", "member"}} {
		if _, err := store.AddUser(context.Background(), db, store.NewUser{
			FirebaseUID: u[0], Email: u[1] + "@example.com", DisplayName: "Test " + u[1], Role: u[1],
		}); err != nil {
			t.Fatal(err)
		}
	}
	v := auth.FakeVerifier{tokAdmin: "uid-admin", tokMember: "uid-member", tokStray: "uid-stray"}
	deps := Deps{Version: "test", Data: db, Now: time.Now, Authn: auth.Middleware(v, store.Users{DB: db})}
	if tweak != nil {
		tweak(db, &deps)
	}
	h := NewRouter(deps)
	return &testAPI{t: t, db: db, h: h}
}

// call sends body (a JSON string; "" sends none) and returns the response.
func (a *testAPI) call(method, path, token, body string) *httptest.ResponseRecorder {
	a.t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	a.h.ServeHTTP(rec, req)
	return rec
}

func do(t *testing.T, method, path, token string) *httptest.ResponseRecorder {
	t.Helper()
	return newTestAPI(t).call(method, path, token, "{}")
}

func wantError(t *testing.T, rec *httptest.ResponseRecorder, status int, code api.ErrorErrorCode) {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("status = %d, want %d (%s)", rec.Code, status, rec.Body)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("content-type = %q", ct)
	}
	var e api.Error
	if err := json.Unmarshal(rec.Body.Bytes(), &e); err != nil {
		t.Fatal(err)
	}
	if e.Error.Code != code || e.Error.Message == "" {
		t.Fatalf("body = %s", rec.Body)
	}
}

func TestUnimplementedRoutesReturnStandard501(t *testing.T) {
	for _, r := range [][2]string{
		{"GET", "/v1/export?format=csv"},
	} {
		wantError(t, do(t, r[0], r[1], tokAdmin), http.StatusNotImplemented, api.ErrorErrorCodeNotImplemented)
	}
}

func TestMissingOrInvalidTokenIs401(t *testing.T) {
	wantError(t, do(t, "GET", "/v1/me", ""), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
	wantError(t, do(t, "GET", "/v1/me", "garbage"), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
	wantError(t, do(t, "GET", "/v1/admin/status", ""), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
}

func TestUnknownUidIs403(t *testing.T) {
	wantError(t, do(t, "GET", "/v1/me", tokStray), http.StatusForbidden, api.ErrorErrorCodeNotAllowlisted)
	wantError(t, do(t, "GET", "/v1/categories", tokStray), http.StatusForbidden, api.ErrorErrorCodeNotAllowlisted)
}

func TestMemberOnAdminRouteIs403(t *testing.T) {
	wantError(t, do(t, "GET", "/v1/admin/status", tokMember), http.StatusForbidden, api.ErrorErrorCodeAdminRequired)
	wantError(t, do(t, "GET", "/v1/admin/backups", tokMember), http.StatusForbidden, api.ErrorErrorCodeAdminRequired)
}

func TestGetMeReturnsCurrentUser(t *testing.T) {
	for tok, role := range map[string]string{tokAdmin: "admin", tokMember: "member"} {
		rec := do(t, "GET", "/v1/me", tok)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
		}
		var me api.Me
		if err := json.Unmarshal(rec.Body.Bytes(), &me); err != nil {
			t.Fatal(err)
		}
		if string(me.Role) != role || me.Id == "" || me.Email.IsNull() || me.Email.MustGet() != role+"@example.com" {
			t.Fatalf("me = %+v", me)
		}
	}
}

func TestHealthzNeedsNoToken(t *testing.T) {
	if rec := do(t, "GET", "/healthz", ""); rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
}

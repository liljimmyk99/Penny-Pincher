package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

func do(method, path string) *httptest.ResponseRecorder {
	h := NewRouter("test", nil, time.Now)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)
	return rec
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
		{"GET", "/v1/categories"},
		{"POST", "/v1/expenses"},
		{"DELETE", "/v1/expenses/abc"},
		{"GET", "/v1/summaries/monthly/2026-01"},
		{"GET", "/v1/admin/status"},
	} {
		wantError(t, do(r[0], r[1]), http.StatusNotImplemented, api.ErrorErrorCodeNotImplemented)
	}
}

func TestMeWithoutIdentityIs401(t *testing.T) {
	wantError(t, do("GET", "/v1/me"), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
}

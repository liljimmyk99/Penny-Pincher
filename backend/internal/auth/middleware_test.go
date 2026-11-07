package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
)

type allowAll struct{}

func (allowAll) FindByFirebaseUID(_ context.Context, uid string) (Identity, error) {
	return Identity{ID: uid, Role: RoleMember}, nil
}

type failingVerifier struct{}

func (failingVerifier) Verify(context.Context, string) (Claims, error) {
	return Claims{}, errors.New("firebase down")
}

func call(t *testing.T, v Verifier, now time.Time, token string) (int, api.ErrorErrorCode) {
	t.Helper()
	h := Middleware(v, allowAll{}, MaxSessionAge, func() time.Time { return now })(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var body api.Error
	_ = json.NewDecoder(rec.Body).Decode(&body)
	return rec.Code, body.Error.Code
}

func TestSessionAge(t *testing.T) {
	now := time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)
	v := FakeClaims{
		"fresh":   {UID: "u", AuthTime: now.Add(-time.Hour)},
		"edge":    {UID: "u", AuthTime: now.Add(-MaxSessionAge)},
		"old":     {UID: "u", AuthTime: now.Add(-MaxSessionAge - time.Second)},
		"no-time": {UID: "u"},
	}
	for tok, want := range map[string]int{"fresh": 204, "edge": 204, "old": 401, "no-time": 401} {
		status, code := call(t, v, now, tok)
		if status != want {
			t.Errorf("%s: status %d, want %d", tok, status, want)
		}
		if want == 401 && code != api.ErrorErrorCodeSessionExpired {
			t.Errorf("%s: code %q, want session_expired", tok, code)
		}
	}
}

func TestRevokedTokenIsUnauthenticated(t *testing.T) {
	status, code := call(t, FakeClaims{}, time.Now(), "revoked")
	if status != 401 || code != api.ErrorErrorCodeUnauthenticated {
		t.Fatalf("got %d %q", status, code)
	}
}

func TestVerifierFailureIsInternal(t *testing.T) {
	status, code := call(t, failingVerifier{}, time.Now(), "any")
	if status != 500 || code != api.ErrorErrorCodeInternal {
		t.Fatalf("got %d %q", status, code)
	}
}

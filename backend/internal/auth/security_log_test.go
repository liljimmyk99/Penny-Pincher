package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/logging"
)

// logLines swaps slog's default for the redacting JSON logger writing to a
// buffer, and returns a func that reads the lines written so far.
func logLines(t *testing.T) func() []map[string]any {
	t.Helper()
	var mu sync.Mutex
	var buf bytes.Buffer
	old := slog.Default()
	slog.SetDefault(logging.New(lockedWriter{&mu, &buf}, "info"))
	t.Cleanup(func() { slog.SetDefault(old) })
	return func() []map[string]any {
		mu.Lock()
		defer mu.Unlock()
		var out []map[string]any
		for _, l := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
			if l == "" {
				continue
			}
			var m map[string]any
			if err := json.Unmarshal([]byte(l), &m); err != nil {
				t.Fatalf("log line is not JSON: %q", l)
			}
			out = append(out, m)
		}
		return out
	}
}

type lockedWriter struct {
	mu *sync.Mutex
	b  *bytes.Buffer
}

func (w lockedWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.b.Write(p)
}

type lookup map[string]Identity

func (l lookup) FindByFirebaseUID(_ context.Context, uid string) (Identity, error) {
	id, ok := l[uid]
	if !ok {
		return Identity{}, ErrUnknownUser
	}
	return id, nil
}

func TestAuthFailuresAreLoggedWithoutSecrets(t *testing.T) {
	now := time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)
	const secretTok = "eyJ-secret-token-value"
	v := FakeClaims{
		"tok-old":      {UID: "uid-old", AuthTime: now.Add(-MaxSessionAge - time.Hour)},
		"tok-stranger": {UID: "uid-stranger", AuthTime: now},
		"tok-member":   {UID: "uid-member", AuthTime: now},
	}
	users := lookup{
		"uid-old":    {ID: "user-old", Role: RoleMember},
		"uid-member": {ID: "user-member", Role: RoleMember},
	}
	h := Middleware(v, users, MaxSessionAge, func() time.Time { return now })(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))

	cases := []struct {
		name, token, path string
		status            int
		reason            string
		uid, userID       string
	}{
		{"missing", "", "/v1/me", 401, logging.ReasonMissingToken, "", ""},
		{"invalid", secretTok, "/v1/trends/custom?text=lunch+at+Acme&amount=1234", 401, logging.ReasonInvalidToken, "", ""},
		{"expired", "tok-old", "/v1/me", 401, logging.ReasonSessionExpired, "uid-old", ""},
		{"stranger", "tok-stranger", "/v1/expenses?note=rent", 403, logging.ReasonNotAllowlisted, "uid-stranger", ""},
		{"member on admin", "tok-member", "/v1/admin/backups", 403, logging.ReasonAdminRequired, "uid-member", "user-member"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			lines := logLines(t)
			req := httptest.NewRequest(http.MethodGet, c.path, nil)
			req.Header.Set("X-Forwarded-For", "198.51.100.7")
			req.Header.Set("Cookie", "session=cookie-secret")
			if c.token != "" {
				req.Header.Set("Authorization", "Bearer "+c.token)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != c.status {
				t.Fatalf("status %d, want %d", rec.Code, c.status)
			}
			got := lines()
			if len(got) != 1 {
				t.Fatalf("want one log line, got %d: %v", len(got), got)
			}
			l := got[0]
			want := map[string]any{
				"level": "WARN", "msg": "auth failure",
				"event": logging.EventAuthFailure, "reason": c.reason, "status": float64(c.status),
				"ip": "198.51.100.7", "method": "GET", "path": strings.SplitN(c.path, "?", 2)[0],
			}
			if c.uid != "" {
				want["uid"] = c.uid
			}
			if c.userID != "" {
				want["user_id"] = c.userID
			}
			for k, v := range want {
				if l[k] != v {
					t.Errorf("%s = %v, want %v", k, l[k], v)
				}
			}
			if _, ok := l["uid"]; ok && c.uid == "" {
				t.Errorf("uid logged for an unverified token: %v", l)
			}
			raw, _ := json.Marshal(l)
			for _, bad := range []string{secretTok, "Bearer", "tok-", "cookie-secret", "lunch", "Acme", "1234", "rent", "?"} {
				if strings.Contains(string(raw), bad) {
					t.Errorf("log line leaked %q: %s", bad, raw)
				}
			}
		})
	}
}

func TestAcceptedRequestsAreNotLogged(t *testing.T) {
	lines := logLines(t)
	h := Middleware(FakeVerifier{"tok": "uid"}, allowAll{}, MaxSessionAge, time.Now)(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	for _, p := range []string{"/healthz", "/v1/me"} {
		req := httptest.NewRequest(http.MethodGet, p, nil)
		req.Header.Set("Authorization", "Bearer tok")
		h.ServeHTTP(httptest.NewRecorder(), req)
	}
	if got := lines(); len(got) != 0 {
		t.Fatalf("accepted requests logged: %v", got)
	}
}

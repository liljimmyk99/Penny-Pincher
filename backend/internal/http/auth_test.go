package http

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/ratelimit"
)

func loginBody(user, pass string) string {
	b, _ := json.Marshal(map[string]string{"username": user, "password": pass})
	return string(b)
}

func login(t *testing.T, a *testAPI, user, pass string) api.LoginResult {
	t.Helper()
	rec := a.call("POST", "/v1/auth/login", "", loginBody(user, pass))
	if rec.Code != http.StatusOK {
		t.Fatalf("login = %d %s", rec.Code, rec.Body)
	}
	var res api.LoginResult
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	return res
}

func TestLoginMeLogout(t *testing.T) {
	a := newTestAPI(t)
	res := login(t, a, "Member", testPassword) // username is case-insensitive
	if res.Token == "" || res.User.Username != "member" || res.MustChangePassword || res.ExpiresAt == nil {
		t.Fatalf("result = %+v", res)
	}
	if d := time.Until(*res.ExpiresAt); d < 29*24*time.Hour || d > 30*24*time.Hour {
		t.Fatalf("expires in %v", d)
	}
	if rec := a.call("GET", "/v1/me", res.Token, ""); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"username":"member"`) {
		t.Fatalf("me = %d %s", rec.Code, rec.Body)
	}
	if rec := a.call("POST", "/v1/auth/logout", res.Token, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("logout = %d %s", rec.Code, rec.Body)
	}
	wantError(t, a.call("GET", "/v1/me", res.Token, ""), 401, api.ErrorErrorCodeUnauthenticated)
	// Signing out one device leaves the others.
	if rec := a.call("GET", "/v1/me", tokMember, ""); rec.Code != 200 {
		t.Fatalf("other session = %d", rec.Code)
	}
	var stored int
	if err := a.db.QueryRow(`SELECT count(*) FROM sessions WHERE token_hash = ?`, []byte(res.Token)).Scan(&stored); err != nil || stored != 0 {
		t.Fatalf("the plain token is stored: %d, %v", stored, err)
	}
}

func TestLoginFailuresAreIndistinguishable(t *testing.T) {
	a := newTestAPI(t)
	wrong := a.call("POST", "/v1/auth/login", "", loginBody("member", "not the password"))
	unknown := a.call("POST", "/v1/auth/login", "", loginBody("nobody", "not the password"))
	wantError(t, wrong, 401, api.ErrorErrorCodeInvalidCredentials)
	wantError(t, unknown, 401, api.ErrorErrorCodeInvalidCredentials)
	if wrong.Body.String() != unknown.Body.String() {
		t.Fatalf("bodies differ:\n%s\n%s", wrong.Body, unknown.Body)
	}
	wantError(t, a.call("POST", "/v1/auth/login", "", `{"username":"member"}`), 400, api.ErrorErrorCodeInvalidRequest)
	wantError(t, a.call("POST", "/v1/auth/login", "", `{"username":"","password":"x"}`), 400, api.ErrorErrorCodeInvalidRequest)
}

func TestLoginIsRateLimitedPerUsername(t *testing.T) {
	a := newTestAPIWith(t, func(_ *sql.DB, d *Deps) {
		d.Limits = &Limits{PerIP: ratelimit.Rule{Rate: 1000, Burst: 1000}, PerUser: ratelimit.Rule{Rate: 1000, Burst: 1000},
			Expensive: ratelimit.Rule{Rate: 1000, Burst: 1000}, Login: ratelimit.Rule{Rate: 0.001, Burst: 3}}
	})
	for range 3 {
		wantError(t, a.call("POST", "/v1/auth/login", "", loginBody("Nobody", "x")), 401, api.ErrorErrorCodeInvalidCredentials)
	}
	rec := a.call("POST", "/v1/auth/login", "", loginBody("nobody", "x"))
	wantError(t, rec, 429, api.ErrorErrorCodeRateLimited)
	if rec.Header().Get("Retry-After") == "" {
		t.Error("no Retry-After")
	}
	// Another username is unaffected.
	if rec := a.call("POST", "/v1/auth/login", "", loginBody("member", testPassword)); rec.Code != 200 {
		t.Fatalf("other user = %d", rec.Code)
	}
}

func TestChangePassword(t *testing.T) {
	a := newTestAPI(t)
	other := login(t, a, "member", testPassword) // a second device
	const newPass = "an entirely new password"
	body := func(cur, next string) string {
		b, _ := json.Marshal(map[string]string{"current_password": cur, "new_password": next})
		return string(b)
	}
	wantError(t, a.call("POST", "/v1/auth/password", "", body(testPassword, newPass)), 401, api.ErrorErrorCodeUnauthenticated)
	wantError(t, a.call("POST", "/v1/auth/password", tokMember, body("wrong current", newPass)), 401, api.ErrorErrorCodeInvalidCredentials)
	rec := a.call("POST", "/v1/auth/password", tokMember, body(testPassword, "short"))
	wantError(t, rec, 400, api.ErrorErrorCodeWeakPassword)
	if !strings.Contains(rec.Body.String(), "new_password") {
		t.Errorf("no field detail: %s", rec.Body)
	}
	wantError(t, a.call("POST", "/v1/auth/password", tokMember, `{"new_password":"`+newPass+`"}`), 400, api.ErrorErrorCodeInvalidRequest)

	rec = a.call("POST", "/v1/auth/password", tokMember, body(testPassword, newPass))
	if rec.Code != 200 {
		t.Fatalf("change = %d %s", rec.Code, rec.Body)
	}
	var res api.LoginResult
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if res.Token == "" || res.Token == tokMember || res.MustChangePassword {
		t.Fatalf("result = %+v", res)
	}
	// Every other session, this one's old token included, is revoked; the new one works.
	wantError(t, a.call("GET", "/v1/me", tokMember, ""), 401, api.ErrorErrorCodeUnauthenticated)
	wantError(t, a.call("GET", "/v1/me", other.Token, ""), 401, api.ErrorErrorCodeUnauthenticated)
	if rec := a.call("GET", "/v1/me", res.Token, ""); rec.Code != 200 {
		t.Fatalf("new token = %d", rec.Code)
	}
	wantError(t, a.call("POST", "/v1/auth/login", "", loginBody("member", testPassword)), 401, api.ErrorErrorCodeInvalidCredentials)
	login(t, a, "member", newPass)
}

func TestMustChangePasswordGate(t *testing.T) {
	a := newTestAPI(t)
	if rec := a.call("POST", "/v1/admin/users", tokAdmin, `{"username":"newbie","password":"`+testPassword+`"}`); rec.Code != 201 {
		t.Fatalf("add = %d %s", rec.Code, rec.Body)
	}
	res := login(t, a, "newbie", testPassword)
	if !res.MustChangePassword || !res.User.MustChangePassword {
		t.Fatalf("flag not set: %+v", res)
	}
	wantError(t, a.call("GET", "/v1/categories", res.Token, ""), 403, api.ErrorErrorCodePasswordChangeRequired)
	wantError(t, a.call("GET", "/v1/admin/status", res.Token, ""), 403, api.ErrorErrorCodePasswordChangeRequired)
	if rec := a.call("GET", "/v1/me", res.Token, ""); rec.Code != 200 {
		t.Fatalf("me while gated = %d", rec.Code)
	}
	rec := a.call("POST", "/v1/auth/password", res.Token, `{"current_password":"`+testPassword+`","new_password":"my own new password"}`)
	if rec.Code != 200 {
		t.Fatalf("change = %d %s", rec.Code, rec.Body)
	}
	var next api.LoginResult
	_ = json.Unmarshal(rec.Body.Bytes(), &next)
	if rec := a.call("GET", "/v1/categories", next.Token, ""); rec.Code != 200 {
		t.Fatalf("after change = %d %s", rec.Code, rec.Body)
	}
	// A gated user can sign out.
	g := login(t, a, "newbie", "my own new password")
	if g.MustChangePassword {
		t.Fatal("flag still set")
	}
}

func TestSessionExpiresAfter30Days(t *testing.T) {
	a := newTestAPI(t)
	res := login(t, a, "member", testPassword)
	old := time.Now().Add(-31 * 24 * time.Hour).UTC().Format("2006-01-02T15:04:05.000Z")
	if _, err := a.db.Exec(`UPDATE sessions SET created_at = ?, last_used_at = ?`, old, time.Now().UTC().Format("2006-01-02T15:04:05.000Z")); err != nil {
		t.Fatal(err)
	}
	// Using it recently does not extend it: the 30 days count from creation.
	wantError(t, a.call("GET", "/v1/me", res.Token, ""), 401, api.ErrorErrorCodeSessionExpired)
	almost := time.Now().Add(-29 * 24 * time.Hour).UTC().Format("2006-01-02T15:04:05.000Z")
	if _, err := a.db.Exec(`UPDATE sessions SET created_at = ?`, almost); err != nil {
		t.Fatal(err)
	}
	if rec := a.call("GET", "/v1/me", res.Token, ""); rec.Code != 200 {
		t.Fatalf("29 days old = %d", rec.Code)
	}
}

func TestAdminResetPassword(t *testing.T) {
	a := newTestAPI(t)
	const newPass = "reset by the admin pw"
	var memberID string
	_ = a.db.QueryRow(`SELECT id FROM users WHERE username = 'member'`).Scan(&memberID)
	path := "/v1/admin/users/" + memberID + "/password"

	wantError(t, a.call("POST", path, tokMember, `{"password":"`+newPass+`"}`), 403, api.ErrorErrorCodeAdminRequired)
	wantError(t, a.call("POST", path, tokAdmin, `{"password":"short"}`), 400, api.ErrorErrorCodeWeakPassword)
	wantError(t, a.call("POST", "/v1/admin/users/99999/password", tokAdmin, `{"password":"`+newPass+`"}`), 404, api.ErrorErrorCodeNotFound)
	wantError(t, a.call("POST", "/v1/admin/users/abc/password", tokAdmin, `{"password":"`+newPass+`"}`), 404, api.ErrorErrorCodeNotFound)

	if rec := a.call("POST", path, tokAdmin, `{"password":"`+newPass+`"}`); rec.Code != http.StatusNoContent {
		t.Fatalf("reset = %d %s", rec.Code, rec.Body)
	}
	wantError(t, a.call("GET", "/v1/me", tokMember, ""), 401, api.ErrorErrorCodeUnauthenticated) // signed out everywhere
	res := login(t, a, "member", newPass)
	if !res.MustChangePassword { // defaults to true
		t.Fatal("reset should require a new password by default")
	}
	if rec := a.call("POST", path, tokAdmin, `{"password":"`+newPass+`","must_change_password":false}`); rec.Code != 204 {
		t.Fatalf("reset 2 = %d", rec.Code)
	}
	if login(t, a, "member", newPass).MustChangePassword {
		t.Fatal("must_change_password:false ignored")
	}
}

// No response and no log line may contain a password, a hash or a token.
func TestNoSecretsInResponsesOrLogs(t *testing.T) {
	var logs bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	a := newTestAPI(t)
	const secret = "a secret nobody may see"
	var all strings.Builder
	record := func(rec interface{ String() string }) { all.WriteString(rec.String()) }

	res := login(t, a, "member", testPassword)
	for _, r := range []struct{ m, p, tok, body string }{
		{"POST", "/v1/auth/login", "", loginBody("member", secret)},
		{"POST", "/v1/auth/login", "", loginBody("ghost", secret)},
		{"POST", "/v1/admin/users", tokAdmin, `{"username":"z","password":"` + secret + `"}`},
		{"POST", "/v1/admin/users", tokAdmin, `{"username":"z2","password":"` + secret + `"}`},
		{"GET", "/v1/admin/users", tokAdmin, ""},
		{"GET", "/v1/me", res.Token, ""},
		{"POST", "/v1/auth/password", tokMember, `{"current_password":"` + secret + `","new_password":"` + secret + `"}`},
		{"POST", "/v1/auth/password", tokMember, `{"current_password":"` + testPassword + `","new_password":"short"}`},
		{"GET", "/v1/me", "bogus-token-value", ""},
	} {
		rec := a.call(r.m, r.p, r.tok, r.body)
		record(rec.Body)
	}
	var hash string
	_ = a.db.QueryRow(`SELECT password_hash FROM users WHERE username = 'z'`).Scan(&hash)
	out := all.String() + logs.String()
	for _, bad := range []string{secret, testPassword, "$argon2id", res.Token, "bogus-token-value", "ghost"} {
		if strings.Contains(out, bad) {
			t.Errorf("output contains %q", bad)
		}
	}
	if hash == "" || !strings.HasPrefix(hash, "$argon2id$") {
		t.Fatalf("stored hash = %q", hash)
	}
	if strings.Contains(out, hash) {
		t.Error("the stored hash leaked")
	}
}

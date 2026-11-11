package http

import (
	"database/sql"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/clientip"
	"github.com/liljimmyk99/penny-pincher/backend/internal/ratelimit"
)

// fakeClock is a settable Now for the limiters.
type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) Now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.t }
func (c *fakeClock) Add(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

func newLimitedAPI(t *testing.T, l Limits) (*testAPI, *fakeClock) {
	clock := &fakeClock{t: time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)}
	a := newTestAPIWith(t, func(_ *sql.DB, d *Deps) {
		d.Limits = &l
		d.Now = clock.Now
	})
	return a, clock
}

// send is call with a client IP (as Caddy sets it) and an optional body reader.
func (a *testAPI) send(method, path, token, ip string, body io.Reader, size int64) *httptest.ResponseRecorder {
	a.t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, body)
	req.ContentLength = size
	req.Header.Set("Content-Type", "application/json")
	if ip != "" {
		req.Header.Set("X-Forwarded-For", ip)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	a.h.ServeHTTP(rec, req)
	return rec
}

func TestOversizedBodyIs413BeforeAuth(t *testing.T) {
	a := newTestAPI(t)
	big := strings.Repeat("x", int(maxBody)+1)
	// Content-Length over the cap: refused before the token is even looked at.
	wantError(t, a.send("POST", "/v1/expenses", "", "", strings.NewReader(big), int64(len(big))),
		http.StatusRequestEntityTooLarge, api.ErrorErrorCodeRequestTooLarge)
}

func TestOversizedBodyWithoutLengthIs413(t *testing.T) {
	a := newTestAPI(t)
	// A valid JSON prefix that never ends inside the cap, sent with no
	// Content-Length (chunked): the cap trips while the body is decoded.
	body := `{"note":"` + strings.Repeat("x", int(maxBody)) + `"}`
	wantError(t, a.send("POST", "/v1/expenses", tokMember, "", strings.NewReader(body), -1),
		http.StatusRequestEntityTooLarge, api.ErrorErrorCodeRequestTooLarge)
}

func TestImportUploadHasItsOwnCap(t *testing.T) {
	a := newTestAPI(t)
	// Over the 1 MB default but under the import cap: passes the cap.
	mid := strings.NewReader(strings.Repeat("x", 2<<20))
	if rec := a.send("POST", "/v1/imports", tokMember, "", mid, 2<<20); rec.Code == http.StatusRequestEntityTooLarge {
		t.Fatalf("2 MB import upload refused: %s", rec.Body)
	}
	wantError(t, a.send("POST", "/v1/imports", tokMember, "", strings.NewReader(""), maxImportBody+1),
		http.StatusRequestEntityTooLarge, api.ErrorErrorCodeFileTooLarge)
}

func TestNormalBodyPassesTheCap(t *testing.T) {
	a := newTestAPI(t)
	rec := a.call("POST", "/v1/categories", tokMember, `{"name":"Pets","color":"#336699"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d (%s)", rec.Code, rec.Body)
	}
}

func wantRateLimited(t *testing.T, rec *httptest.ResponseRecorder, retryAfter string) {
	t.Helper()
	wantError(t, rec, http.StatusTooManyRequests, api.ErrorErrorCodeRateLimited)
	if got := rec.Header().Get("Retry-After"); got != retryAfter {
		t.Fatalf("Retry-After = %q, want %q", got, retryAfter)
	}
}

func TestPerIPLimitAppliesBeforeAuth(t *testing.T) {
	a, clock := newLimitedAPI(t, Limits{
		PerIP:     ratelimit.Rule{Rate: 0.5, Burst: 3},
		PerUser:   ratelimit.Rule{Rate: 100, Burst: 100},
		Expensive: ratelimit.Rule{Rate: 100, Burst: 100},
	})
	for range 3 {
		wantError(t, a.send("GET", "/v1/me", "garbage", "203.0.113.7", nil, 0), http.StatusUnauthorized, api.ErrorErrorCodeUnauthenticated)
	}
	// Bad tokens used the burst; now even a good one is refused, without verifying.
	wantRateLimited(t, a.send("GET", "/v1/me", tokMember, "203.0.113.7", nil, 0), "2")
	// Another client is unaffected.
	if rec := a.send("GET", "/v1/me", tokMember, "203.0.113.8", nil, 0); rec.Code != http.StatusOK {
		t.Fatalf("other IP: status = %d", rec.Code)
	}
	clock.Add(2 * time.Second)
	if rec := a.send("GET", "/v1/me", tokMember, "203.0.113.7", nil, 0); rec.Code != http.StatusOK {
		t.Fatalf("after refill: status = %d", rec.Code)
	}
}

func TestPerUserLimitIsPerUser(t *testing.T) {
	a, _ := newLimitedAPI(t, Limits{
		PerIP:     ratelimit.Rule{Rate: 100, Burst: 100},
		PerUser:   ratelimit.Rule{Rate: 1, Burst: 5},
		Expensive: ratelimit.Rule{Rate: 100, Burst: 100},
	})
	// Same IP for both users, so only the per-user bucket can tell them apart.
	for i := range 5 {
		if rec := a.send("GET", "/v1/categories", tokMember, "203.0.113.7", nil, 0); rec.Code != http.StatusOK {
			t.Fatalf("request %d: status = %d", i, rec.Code)
		}
	}
	wantRateLimited(t, a.send("GET", "/v1/categories", tokMember, "203.0.113.7", nil, 0), "1")
	if rec := a.send("GET", "/v1/categories", tokAdmin, "203.0.113.7", nil, 0); rec.Code != http.StatusOK {
		t.Fatalf("other user: status = %d (%s)", rec.Code, rec.Body)
	}
}

func TestExpensiveRoutesHaveATighterLimit(t *testing.T) {
	a, clock := newLimitedAPI(t, Limits{
		PerIP:     ratelimit.Rule{Rate: 100, Burst: 100},
		PerUser:   ratelimit.Rule{Rate: 100, Burst: 100},
		Expensive: ratelimit.Rule{Rate: 0.1, Burst: 2},
	})
	for range 2 {
		wantOK(t, a.send("GET", "/v1/export?format=csv", tokMember, "", nil, 0))
	}
	wantRateLimited(t, a.send("GET", "/v1/export?format=csv", tokMember, "", nil, 0), "10")
	// Ordinary routes still work, and the expensive bucket is per user.
	if rec := a.send("GET", "/v1/categories", tokMember, "", nil, 0); rec.Code != http.StatusOK {
		t.Fatalf("ordinary route: status = %d", rec.Code)
	}
	wantOK(t, a.send("GET", "/v1/export?format=csv", tokAdmin, "", nil, 0))
	clock.Add(10 * time.Second)
	wantOK(t, a.send("GET", "/v1/export?format=csv", tokMember, "", nil, 0))
}

func wantOK(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}

func TestClientIP(t *testing.T) {
	for _, c := range []struct {
		xff  []string
		want string
	}{
		{nil, "192.0.2.1"}, // httptest's RemoteAddr
		{[]string{"203.0.113.7"}, "203.0.113.7"},
		{[]string{"10.0.0.1, 203.0.113.7"}, "203.0.113.7"},
		{[]string{"10.0.0.1", "203.0.113.9 "}, "203.0.113.9"},
	} {
		r := httptest.NewRequest("GET", "/", nil)
		for _, v := range c.xff {
			r.Header.Add("X-Forwarded-For", v)
		}
		if got := clientip.From(r); got != c.want {
			t.Errorf("clientip.From(%q) = %q, want %q", c.xff, got, c.want)
		}
	}
}

// Ordinary responses get a write deadline; streaming routes get none, even on
// a kept-alive connection whose previous request set one.
func TestWriteDeadlinesSpareStreamingRoutes(t *testing.T) {
	old := writeTimeout
	writeTimeout = 100 * time.Millisecond
	t.Cleanup(func() { writeTimeout = old })

	var l *limiters // rate limiting off; body caps and deadlines only
	srv := httptest.NewServer(l.edge(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("quick") != "" {
			_, _ = io.WriteString(w, "ok")
			return
		}
		f := w.(http.Flusher)
		_, _ = io.WriteString(w, "first,")
		f.Flush()
		time.Sleep(300 * time.Millisecond)
		_, _ = io.WriteString(w, strings.Repeat("x", 1<<20)) // past the socket buffer
		_, _ = io.WriteString(w, ",last")
	})))
	t.Cleanup(srv.Close)
	c := srv.Client()

	get := func(path string) (string, error) {
		resp, err := c.Get(srv.URL + path)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		b, err := io.ReadAll(resp.Body)
		return string(b), err
	}

	if body, err := get("/v1/categories"); err == nil && strings.HasSuffix(body, ",last") {
		t.Fatal("ordinary route outlived its write deadline")
	}
	// Set a deadline on a kept-alive connection, then stream on it.
	if _, err := get("/v1/categories?quick=1"); err != nil {
		t.Fatal(err)
	}
	time.Sleep(150 * time.Millisecond) // the previous request's deadline has passed
	for _, p := range []string{"/v1/imports/1/events", "/v1/admin/backups/abc/download", "/v1/export"} {
		body, err := get(p)
		if err != nil || !strings.HasSuffix(body, ",last") {
			t.Fatalf("%s was cut off (err %v, %d bytes)", p, err, len(body))
		}
	}
}

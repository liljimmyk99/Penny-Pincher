package http

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

type pinger struct{ err error }

func (p pinger) PingContext(context.Context) error { return p.err }

func get(t *testing.T, db Pinger) (*httptest.ResponseRecorder, api.Health) {
	t.Helper()
	clock := time.Unix(1000, 0)
	h := NewRouter("1.2.3", db, func() time.Time { c := clock; clock = clock.Add(5 * time.Second); return c })
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/healthz", nil))
	var body api.Health
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return rec, body
}

func TestHealthOK(t *testing.T) {
	rec, b := get(t, pinger{})
	if rec.Code != http.StatusOK || b.Status != "ok" || b.Version != "1.2.3" || b.UptimeSeconds != 5 {
		t.Fatalf("%d %+v", rec.Code, b)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatal(ct)
	}
}

func TestHealthDegraded(t *testing.T) {
	rec, b := get(t, pinger{errors.New("down")})
	if rec.Code != http.StatusServiceUnavailable || b.Status != "degraded" {
		t.Fatalf("%d %+v", rec.Code, b)
	}
}

func TestHealthShapeHasOnlySpecFields(t *testing.T) {
	rec, _ := get(t, nil)
	var m map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &m)
	if len(m) != 3 {
		t.Fatalf("unexpected fields: %v", m)
	}
}

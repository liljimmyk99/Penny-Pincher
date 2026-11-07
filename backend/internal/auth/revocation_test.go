package auth

import (
	"context"
	"errors"
	"testing"
	"time"
)

// fakeAccounts is a Firebase stand-in whose accounts tests change mid-test.
type fakeAccounts struct {
	states map[string]AccountState
	err    error // returned by every lookup when set
	calls  int
}

func (f *fakeAccounts) fetch(_ context.Context, uid string) (AccountState, error) {
	f.calls++
	if f.err != nil {
		return AccountState{}, f.err
	}
	s, ok := f.states[uid]
	if !ok {
		return AccountState{}, ErrAccountGone
	}
	return s, nil
}

type clock struct{ t time.Time }

func (c *clock) now() time.Time          { return c.t }
func (c *clock) advance(d time.Duration) { c.t = c.t.Add(d) }

func newChecker() (*RevocationChecker, *fakeAccounts, *clock) {
	accts := &fakeAccounts{states: map[string]AccountState{"u1": {}}}
	clk := &clock{t: time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)}
	return NewRevocationChecker(accts.fetch, RevocationCacheTTL, clk.now), accts, clk
}

func TestRevocationAllowsAndCaches(t *testing.T) {
	c, accts, clk := newChecker()
	ctx := context.Background()
	for range 3 {
		if err := c.Check(ctx, "u1", clk.t); err != nil {
			t.Fatalf("Check: %v", err)
		}
	}
	if accts.calls != 1 {
		t.Fatalf("lookups = %d, want 1 (cached)", accts.calls)
	}
}

func TestRevokedSessionsAreRefusedWithinTheWindow(t *testing.T) {
	c, accts, clk := newChecker()
	ctx := context.Background()
	issued := clk.t
	if err := c.Check(ctx, "u1", issued); err != nil {
		t.Fatal(err)
	}

	clk.advance(time.Minute)
	accts.states["u1"] = AccountState{ValidAfter: clk.t} // revoke refresh tokens
	if err := c.Check(ctx, "u1", issued); err != nil {
		t.Fatalf("still cached, want nil, got %v", err)
	}

	clk.advance(RevocationCacheTTL)
	if err := c.Check(ctx, "u1", issued); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("after the window: got %v, want ErrInvalidToken", err)
	}
	// A token issued after the revocation (the user signed in again) works.
	if err := c.Check(ctx, "u1", clk.t); err != nil {
		t.Fatalf("new token: %v", err)
	}
}

func TestDisabledAndDeletedAccountsAreRefused(t *testing.T) {
	c, accts, clk := newChecker()
	ctx := context.Background()
	accts.states["u2"] = AccountState{Disabled: true}
	if err := c.Check(ctx, "u2", clk.t); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("disabled: got %v", err)
	}
	if err := c.Check(ctx, "nobody", clk.t); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("deleted: got %v", err)
	}

	if err := c.Check(ctx, "u1", clk.t); err != nil {
		t.Fatal(err)
	}
	accts.states["u1"] = AccountState{Disabled: true}
	clk.advance(RevocationCacheTTL)
	if err := c.Check(ctx, "u1", clk.t); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("disabled after the window: got %v", err)
	}
}

func TestLookupFailureUsesRecentStateOrFails(t *testing.T) {
	c, accts, clk := newChecker()
	ctx := context.Background()
	if err := c.Check(ctx, "u1", clk.t); err != nil {
		t.Fatal(err)
	}
	accts.err = errors.New("unreachable")

	clk.advance(RevocationCacheTTL)
	if err := c.Check(ctx, "u1", clk.t); err != nil {
		t.Fatalf("stale state within the limit: got %v", err)
	}
	clk.advance(revocationStaleLimit)
	err := c.Check(ctx, "u1", clk.t)
	if err == nil || errors.Is(err, ErrInvalidToken) {
		t.Fatalf("too stale: got %v, want a lookup error", err)
	}
	if err := c.Check(ctx, "u3", clk.t); err == nil || errors.Is(err, ErrInvalidToken) {
		t.Fatalf("never cached: got %v, want a lookup error", err)
	}
}

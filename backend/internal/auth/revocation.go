package auth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// RevocationCacheTTL is how long a Firebase account's state is reused before
// it is looked up again, so revoking or disabling a user stops their tokens
// within this window (AGENTS.md section 10).
const RevocationCacheTTL = 5 * time.Minute

// revocationStaleLimit is how long a cached state may still be used when
// Firebase can't be reached. Revocations happen in Firebase, so none can be
// missed while it is down; an hour matches an ID token's own lifetime.
const revocationStaleLimit = time.Hour

// sweepAbove is the cache size above which expired entries are dropped.
const sweepAbove = 1024

// ErrAccountGone means the Firebase account no longer exists.
var ErrAccountGone = errors.New("firebase account not found")

// AccountState is the part of a Firebase account the revocation check needs.
type AccountState struct {
	Disabled bool
	// ValidAfter is when the user's sessions were last revoked: tokens issued
	// before it are refused. Zero when they never were.
	ValidAfter time.Time
}

// AccountFetcher looks up a Firebase account. It returns ErrAccountGone when
// there is none.
type AccountFetcher func(ctx context.Context, uid string) (AccountState, error)

// RevocationChecker refuses tokens of disabled, deleted or revoked accounts,
// looking each account up at most once per RevocationCacheTTL.
type RevocationChecker struct {
	fetch AccountFetcher
	ttl   time.Duration
	now   func() time.Time

	mu      sync.Mutex
	entries map[string]cachedAccount
}

type cachedAccount struct {
	state   AccountState
	fetched time.Time
}

// NewRevocationChecker returns a checker backed by fetch.
func NewRevocationChecker(fetch AccountFetcher, ttl time.Duration, now func() time.Time) *RevocationChecker {
	return &RevocationChecker{fetch: fetch, ttl: ttl, now: now, entries: map[string]cachedAccount{}}
}

// Check returns ErrInvalidToken when a token for uid issued at issuedAt must
// be refused, nil when it may be used, and another error when the account
// could not be looked up.
func (c *RevocationChecker) Check(ctx context.Context, uid string, issuedAt time.Time) error {
	state, err := c.state(ctx, uid)
	if errors.Is(err, ErrAccountGone) {
		return ErrInvalidToken
	}
	if err != nil {
		return err
	}
	if state.Disabled || issuedAt.Before(state.ValidAfter) {
		return ErrInvalidToken
	}
	return nil
}

func (c *RevocationChecker) state(ctx context.Context, uid string) (AccountState, error) {
	now := c.now()
	c.mu.Lock()
	cached, ok := c.entries[uid]
	c.mu.Unlock()
	if ok && now.Sub(cached.fetched) < c.ttl {
		return cached.state, nil
	}

	state, err := c.fetch(ctx, uid)
	if errors.Is(err, ErrAccountGone) {
		c.mu.Lock()
		delete(c.entries, uid)
		c.mu.Unlock()
		return AccountState{}, err
	}
	if err != nil {
		if ok && now.Sub(cached.fetched) < revocationStaleLimit {
			slog.Warn("firebase account lookup failed; using the cached state", "err_type", fmt.Sprintf("%T", err))
			return cached.state, nil
		}
		return AccountState{}, fmt.Errorf("firebase account lookup: %w", err)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) >= sweepAbove {
		for k, e := range c.entries {
			if now.Sub(e.fetched) >= revocationStaleLimit {
				delete(c.entries, k)
			}
		}
	}
	c.entries[uid] = cachedAccount{state: state, fetched: now}
	return state, nil
}

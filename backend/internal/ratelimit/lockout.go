package ratelimit

import (
	"sync"
	"time"
)

// LockoutRule locks a key for Duration after Threshold failures in a row.
type LockoutRule struct {
	Threshold int
	Duration  time.Duration
}

// Lockout counts consecutive failures per key (a lower-cased username, known
// or not) and locks the key once the threshold is reached. A success resets
// the count. Like Limiter it is in memory, takes the clock from the caller and
// evicts idle keys.
type Lockout struct {
	rule LockoutRule

	mu        sync.Mutex
	entries   map[string]*lockEntry
	lastSweep time.Time
}

type lockEntry struct {
	fails       int
	lockedUntil time.Time
	lastSeen    time.Time
}

// NewLockout returns a Lockout applying rule to each key.
func NewLockout(rule LockoutRule) *Lockout {
	return &Lockout{rule: rule, entries: map[string]*lockEntry{}}
}

// Locked reports whether key is locked at now and, if so, for how much longer.
func (l *Lockout) Locked(key string, now time.Time) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.sweep(now)
	e, ok := l.entries[key]
	if !ok || !now.Before(e.lockedUntil) {
		return false, 0
	}
	return true, e.lockedUntil.Sub(now)
}

// Fail records a failed attempt. The threshold-th consecutive failure locks the
// key for the rule's duration and starts the count again.
func (l *Lockout) Fail(key string, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.sweep(now)
	e, ok := l.entries[key]
	if !ok {
		e = &lockEntry{}
		l.entries[key] = e
	}
	e.lastSeen = now
	e.fails++
	if e.fails >= l.rule.Threshold {
		e.fails = 0
		e.lockedUntil = now.Add(l.rule.Duration)
	}
}

// Reset forgets key (a successful sign-in).
func (l *Lockout) Reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, key)
}

// Len is the number of keys held (for tests).
func (l *Lockout) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.entries)
}

// sweep drops entries that are unlocked and have been quiet for the lock
// duration, at most once per that duration. Called with mu held.
func (l *Lockout) sweep(now time.Time) {
	if now.Sub(l.lastSweep) < l.rule.Duration {
		return
	}
	l.lastSweep = now
	for k, e := range l.entries {
		if !now.Before(e.lockedUntil) && now.Sub(e.lastSeen) >= l.rule.Duration {
			delete(l.entries, k)
		}
	}
}

// Package ratelimit keeps in-memory token buckets keyed by a string (a client
// IP or a user id). The API is a single process, so nothing is shared or
// persisted; a restart refills every bucket.
package ratelimit

import (
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// Rule is a token bucket: Rate tokens per second, holding at most Burst.
type Rule struct {
	Rate  float64
	Burst int
}

// Limiter holds one bucket per key. Buckets idle for longer than the idle
// window are evicted (by then they are full again, so nothing is lost).
type Limiter struct {
	rule Rule
	idle time.Duration

	mu        sync.Mutex
	buckets   map[string]*bucket
	lastSweep time.Time
}

type bucket struct {
	lim      *rate.Limiter
	lastSeen time.Time
}

// New returns a limiter applying rule to each key. idle must be long enough
// for an empty bucket to refill (Burst / Rate seconds); New raises it if not.
func New(rule Rule, idle time.Duration) *Limiter {
	if refill := time.Duration(float64(rule.Burst) / rule.Rate * float64(time.Second)); idle < refill {
		idle = refill
	}
	return &Limiter{rule: rule, idle: idle, buckets: map[string]*bucket{}}
}

// Allow takes one token from key's bucket at now. When the bucket is empty it
// takes nothing and returns how long until a token is available.
func (l *Limiter) Allow(key string, now time.Time) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.sweep(now)
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{lim: rate.NewLimiter(rate.Limit(l.rule.Rate), l.rule.Burst)}
		l.buckets[key] = b
	}
	b.lastSeen = now
	r := b.lim.ReserveN(now, 1)
	if !r.OK() {
		return false, l.idle
	}
	if d := r.DelayFrom(now); d > 0 {
		r.CancelAt(now)
		return false, d
	}
	return true, 0
}

// Len is the number of buckets held (for tests).
func (l *Limiter) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}

// sweep evicts idle buckets, at most once per idle window. Called with mu held.
func (l *Limiter) sweep(now time.Time) {
	if now.Sub(l.lastSweep) < l.idle {
		return
	}
	l.lastSweep = now
	for k, b := range l.buckets {
		if now.Sub(b.lastSeen) >= l.idle {
			delete(l.buckets, k)
		}
	}
}

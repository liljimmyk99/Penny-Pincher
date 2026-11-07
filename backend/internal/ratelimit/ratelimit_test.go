package ratelimit

import (
	"testing"
	"time"
)

func TestBurstThenRefill(t *testing.T) {
	l := New(Rule{Rate: 2, Burst: 3}, time.Minute)
	now := time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)
	for i := range 3 {
		if ok, _ := l.Allow("a", now); !ok {
			t.Fatalf("request %d refused inside the burst", i)
		}
	}
	ok, wait := l.Allow("a", now)
	if ok || wait != 500*time.Millisecond {
		t.Fatalf("over the burst: ok=%v wait=%v, want refused with 500ms", ok, wait)
	}
	// A refused request takes no token: half a second later exactly one is back.
	now = now.Add(500 * time.Millisecond)
	if ok, _ := l.Allow("a", now); !ok {
		t.Fatal("refused after refill")
	}
	if ok, _ := l.Allow("a", now); ok {
		t.Fatal("allowed a second request with one token refilled")
	}
}

func TestKeysAreIndependent(t *testing.T) {
	l := New(Rule{Rate: 1, Burst: 1}, time.Minute)
	now := time.Now()
	if ok, _ := l.Allow("a", now); !ok {
		t.Fatal("a refused")
	}
	if ok, _ := l.Allow("a", now); ok {
		t.Fatal("a allowed twice")
	}
	if ok, _ := l.Allow("b", now); !ok {
		t.Fatal("b refused because of a")
	}
}

func TestIdleBucketsAreEvicted(t *testing.T) {
	l := New(Rule{Rate: 1, Burst: 1}, time.Minute)
	now := time.Now()
	l.Allow("a", now)
	l.Allow("b", now.Add(30*time.Second))
	if l.Len() != 2 {
		t.Fatalf("len = %d", l.Len())
	}
	l.Allow("c", now.Add(61*time.Second)) // sweeps a (idle 61s); b is 31s idle
	if l.Len() != 2 {
		t.Fatalf("after sweep len = %d, want 2 (b, c)", l.Len())
	}
}

func TestIdleIsAtLeastTheRefillTime(t *testing.T) {
	// Evicting a bucket before it refills would hand out a fresh burst early.
	l := New(Rule{Rate: 0.1, Burst: 5}, time.Second)
	if l.idle != 50*time.Second {
		t.Fatalf("idle = %v, want 50s", l.idle)
	}
}

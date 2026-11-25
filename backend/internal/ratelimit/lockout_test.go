package ratelimit

import (
	"testing"
	"time"
)

var t0 = time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)

func TestLockoutAfterThreshold(t *testing.T) {
	l := NewLockout(LockoutRule{Threshold: 3, Duration: 15 * time.Minute})
	for i := 0; i < 2; i++ {
		l.Fail("a", t0)
		if locked, _ := l.Locked("a", t0); locked {
			t.Fatalf("locked after %d failures", i+1)
		}
	}
	l.Fail("a", t0)
	locked, wait := l.Locked("a", t0.Add(time.Minute))
	if !locked || wait != 14*time.Minute {
		t.Fatalf("locked=%v wait=%v, want locked for 14m", locked, wait)
	}
	if locked, _ := l.Locked("b", t0); locked {
		t.Fatal("other key must not be locked")
	}
	if locked, _ := l.Locked("a", t0.Add(15*time.Minute)); locked {
		t.Fatal("still locked after the duration")
	}
}

func TestLockoutResetOnSuccess(t *testing.T) {
	l := NewLockout(LockoutRule{Threshold: 3, Duration: time.Minute})
	l.Fail("a", t0)
	l.Fail("a", t0)
	l.Reset("a")
	l.Fail("a", t0)
	l.Fail("a", t0)
	if locked, _ := l.Locked("a", t0); locked {
		t.Fatal("count should have restarted after Reset")
	}
}

func TestLockoutRestartsCountAfterLock(t *testing.T) {
	l := NewLockout(LockoutRule{Threshold: 2, Duration: time.Minute})
	l.Fail("a", t0)
	l.Fail("a", t0)
	later := t0.Add(2 * time.Minute)
	l.Fail("a", later)
	if locked, _ := l.Locked("a", later); locked {
		t.Fatal("one failure after a lock expired must not lock again")
	}
}

func TestLockoutEvictsQuietKeys(t *testing.T) {
	l := NewLockout(LockoutRule{Threshold: 3, Duration: time.Minute})
	l.Fail("a", t0)
	l.Fail("b", t0)
	l.Locked("c", t0.Add(2*time.Minute))
	if n := l.Len(); n != 0 {
		t.Fatalf("Len=%d, want 0 after eviction", n)
	}
}

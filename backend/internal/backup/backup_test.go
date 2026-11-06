package backup

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"filippo.io/age"

	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

// memBucket is an in-memory Bucket.
type memBucket struct {
	mu   sync.Mutex
	objs map[string][]byte
}

func newMem() *memBucket { return &memBucket{objs: map[string][]byte{}} }

func (m *memBucket) Put(_ context.Context, key string, r io.Reader, _ int64) error {
	b, err := io.ReadAll(r)
	m.mu.Lock()
	m.objs[key] = b
	m.mu.Unlock()
	return err
}
func (m *memBucket) List(_ context.Context, prefix string) ([]Object, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []Object
	for k, v := range m.objs {
		if strings.HasPrefix(k, prefix) {
			out = append(out, Object{Key: k, Size: int64(len(v))})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out, nil
}
func (m *memBucket) Get(_ context.Context, key string) (io.ReadCloser, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return io.NopCloser(strings.NewReader(string(m.objs[key]))), nil
}
func (m *memBucket) Delete(_ context.Context, key string) error {
	m.mu.Lock()
	delete(m.objs, key)
	m.mu.Unlock()
	return nil
}

func newService(t *testing.T) (*Service, *memBucket, *age.X25519Identity, *time.Time) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "live.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := store.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO users (firebase_uid, role) VALUES ('uid-1', 'member')`); err != nil {
		t.Fatal(err)
	}
	id, err := age.GenerateX25519Identity()
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 11, 1, 3, 0, 0, 0, time.UTC)
	b := newMem()
	return &Service{DB: db, Bucket: b, Recipient: id.Recipient(), TempDir: t.TempDir(), Now: func() time.Time { return now }}, b, id, &now
}

func TestSnapshotRestoresToSameData(t *testing.T) {
	ctx := context.Background()
	s, b, id, _ := newService(t)
	res, err := s.Run(ctx, Manual)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(res.Key, "manual/") || !strings.HasSuffix(res.Key, ".sqlite.age") {
		t.Fatalf("key %q", res.Key)
	}
	enc := b.objs[res.Key]
	if strings.Contains(string(enc), "SQLite format") {
		t.Fatal("stored snapshot is not encrypted")
	}
	src := filepath.Join(t.TempDir(), "snap.age")
	os.WriteFile(src, enc, 0o600)
	dst := filepath.Join(t.TempDir(), "restored.db")
	if err := RestoreFile(ctx, src, dst, id); err != nil {
		t.Fatal(err)
	}
	if err := VerifyFile(ctx, dst); err != nil {
		t.Fatal(err)
	}
	rdb, err := store.Open(dst)
	if err != nil {
		t.Fatal(err)
	}
	defer rdb.Close()
	var uid string
	var cats int
	if err := rdb.QueryRow(`SELECT firebase_uid FROM users`).Scan(&uid); err != nil || uid != "uid-1" {
		t.Fatalf("uid %q, %v", uid, err)
	}
	if err := rdb.QueryRow(`SELECT count(*) FROM categories`).Scan(&cats); err != nil || cats == 0 {
		t.Fatalf("categories %d, %v", cats, err)
	}
	if err := RestoreFile(ctx, src, dst, id); err == nil {
		t.Fatal("restore must refuse to overwrite an existing file")
	}
	other, _ := age.GenerateX25519Identity()
	if err := RestoreFile(ctx, src, filepath.Join(t.TempDir(), "x.db"), other); err == nil {
		t.Fatal("wrong key must not decrypt")
	}
	if s.Last() == nil || s.Last().Err != nil {
		t.Fatalf("last = %+v", s.Last())
	}
}

func TestRetention(t *testing.T) {
	ctx := context.Background()
	s, b, _, now := newService(t)
	b.objs["weekly/not-a-snapshot.txt"] = []byte("x")
	for i := 0; i < 11; i++ {
		*now = time.Date(2026, 1, 4, 3, 0, 0, 0, time.UTC).AddDate(0, 0, 7*i)
		if _, err := s.Run(ctx, Weekly); err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 15; i++ {
		*now = time.Date(2025, 1, 1, 3, 0, 0, 0, time.UTC).AddDate(0, i, 0)
		if _, err := s.Run(ctx, Monthly); err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 15; i++ {
		*now = time.Date(2026, 5, 1, 3, 0, i, 0, time.UTC)
		if _, err := s.Run(ctx, Manual); err != nil {
			t.Fatal(err)
		}
	}
	w, _ := s.List(ctx, Weekly)
	m, _ := s.List(ctx, Monthly)
	n, _ := s.List(ctx, Manual)
	if len(w) != 8 || len(m) != 12 || len(n) != 15 {
		t.Fatalf("weekly %d monthly %d manual %d", len(w), len(m), len(n))
	}
	if !w[0].Time.After(w[7].Time) || w[0].Time.Month() != time.March {
		t.Fatalf("kept the wrong ones: newest %v oldest %v", w[0].Time, w[7].Time)
	}
	if _, ok := b.objs["weekly/not-a-snapshot.txt"]; !ok {
		t.Fatal("unrelated object was pruned")
	}
}

func TestDue(t *testing.T) {
	ctx := context.Background()
	s, _, _, now := newService(t)
	at := func(y int, mo time.Month, d, h int) time.Time { return time.Date(y, mo, d, h, 0, 0, 0, time.UTC) }
	check := func(when time.Time, want ...Kind) {
		t.Helper()
		got, err := s.due(ctx, when)
		if err != nil || len(got) != len(want) {
			t.Fatalf("%v: got %v, %v want %v", when, got, err, want)
		}
		for i := range want {
			if got[i] != want[i] {
				t.Fatalf("%v: got %v want %v", when, got, want)
			}
		}
	}
	check(at(2026, 11, 3, 12))                 // Tuesday, not the 1st
	check(at(2026, 11, 8, 2))                  // Sunday before the run hour
	check(at(2026, 11, 8, 3), Weekly)          // Sunday
	check(at(2026, 11, 1, 5), Weekly, Monthly) // Sunday the 1st
	*now = at(2026, 11, 8, 3)
	if _, err := s.Run(ctx, Weekly); err != nil {
		t.Fatal(err)
	}
	check(at(2026, 11, 8, 9)) // already taken today
	check(at(2026, 11, 15, 3), Weekly)
}

func TestBusy(t *testing.T) {
	ctx := context.Background()
	s, _, _, _ := newService(t)
	s.running = &job{}
	if _, err := s.Run(ctx, Manual); err != ErrBusy {
		t.Fatalf("got %v", err)
	}
}

func TestNextRunTimes(t *testing.T) {
	at := func(y, m, d, h int) time.Time { return time.Date(y, time.Month(m), d, h, 0, 0, 0, time.UTC) }
	cases := []struct{ now, weekly, monthly time.Time }{
		{at(2026, 11, 6, 12), at(2026, 11, 8, 3), at(2026, 12, 1, 3)}, // Friday
		{at(2026, 11, 8, 2), at(2026, 11, 8, 3), at(2026, 12, 1, 3)},  // Sunday before run
		{at(2026, 11, 8, 3), at(2026, 11, 15, 3), at(2026, 12, 1, 3)}, // Sunday at run time
		{at(2026, 11, 1, 2), at(2026, 11, 1, 3), at(2026, 11, 1, 3)},  // the 1st (a Sunday) before run
		{at(2026, 12, 31, 23), at(2027, 1, 3, 3), at(2027, 1, 1, 3)},  // year boundary
	}
	for _, c := range cases {
		if got := NextWeekly(c.now); !got.Equal(c.weekly) {
			t.Errorf("NextWeekly(%v) = %v, want %v", c.now, got, c.weekly)
		}
		if got := NextMonthly(c.now); !got.Equal(c.monthly) {
			t.Errorf("NextMonthly(%v) = %v, want %v", c.now, got, c.monthly)
		}
	}
}

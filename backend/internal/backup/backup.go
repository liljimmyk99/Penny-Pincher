// Package backup takes encrypted snapshots of the SQLite database and keeps
// them off the server (AGENTS.md section 8, decisions of 2026-11-06).
//
// A snapshot is made with VACUUM INTO (a consistent copy of a live WAL
// database), encrypted to an age public key, and uploaded to an
// S3-compatible bucket. The server never holds the private key and never
// decrypts. Nothing here logs data from the database.
package backup

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"filippo.io/age"
	_ "modernc.org/sqlite"
)

// Kind says why a snapshot was taken; it is also its bucket prefix.
type Kind string

const (
	Weekly  Kind = "weekly"
	Monthly Kind = "monthly"
	Manual  Kind = "manual"
)

// Retention is how many snapshots to keep per kind. Manual snapshots are never
// pruned automatically.
var Retention = map[Kind]int{Weekly: 8, Monthly: 12}

// ErrBusy is returned when a backup is already running.
var ErrBusy = errors.New("a backup is already running")

// Object is a stored snapshot.
type Object struct {
	Key  string
	Size int64
	Time time.Time // from the key, UTC
}

// Bucket is the off-server storage. Keys are "<kind>/<name>".
type Bucket interface {
	Put(ctx context.Context, key string, r io.Reader, size int64) error
	List(ctx context.Context, prefix string) ([]Object, error)
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
}

// Result is the outcome of the most recent run, for the admin status tile.
type Result struct {
	Kind Kind
	Key  string
	At   time.Time
	Err  error // nil on success

	ID       string    // job id, see Run.ID
	Finished time.Time // when the run ended
}

// Service takes and prunes snapshots.
type Service struct {
	DB        *sql.DB
	Bucket    Bucket
	Recipient age.Recipient
	TempDir   string // where plaintext snapshots briefly live; defaults to os.TempDir()
	Now       func() time.Time

	mu      sync.Mutex
	running *job
	seq     int
	last    *Result
}

// ParseRecipient parses an age public key ("age1...").
func ParseRecipient(s string) (age.Recipient, error) {
	r, err := age.ParseX25519Recipient(strings.TrimSpace(s))
	if err != nil {
		return nil, fmt.Errorf("invalid BACKUP_AGE_RECIPIENT: %w", err)
	}
	return r, nil
}

// Last returns the most recent run since this process started, or nil.
func (s *Service) Last() *Result {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.last == nil {
		return nil
	}
	r := *s.last
	return &r
}

const stampLayout = "20060102T150405Z"

// keyFor builds "<kind>/penny-pincher-<UTC stamp>-<kind>.sqlite.age".
func keyFor(kind Kind, t time.Time) string {
	return fmt.Sprintf("%s/penny-pincher-%s-%s.sqlite.age", kind, t.UTC().Format(stampLayout), kind)
}

func parseKey(key string) (time.Time, bool) {
	name := path.Base(key)
	name = strings.TrimSuffix(name, ".sqlite.age")
	parts := strings.Split(name, "-")
	if len(parts) < 3 {
		return time.Time{}, false
	}
	t, err := time.Parse(stampLayout, parts[len(parts)-2])
	return t, err == nil
}

// Run takes one snapshot of the given kind, uploads it, then prunes. It is
// safe to call from several goroutines; a second concurrent call gets ErrBusy.
func (s *Service) Run(ctx context.Context, kind Kind) (Result, error) {
	job, err := s.begin(kind)
	if err != nil {
		return Result{}, err
	}
	return s.finish(job, ctx), job.err
}

// Start begins a snapshot in the background and returns at once with the
// running job. The outcome shows up in Last and Runs. A second concurrent
// start gets ErrBusy.
func (s *Service) Start(kind Kind) (Run, error) {
	job, err := s.begin(kind)
	if err != nil {
		return Run{}, err
	}
	go s.finish(job, context.Background())
	return job.run(), nil
}

type job struct {
	s    *Service
	kind Kind
	id   string
	at   time.Time
	err  error
}

func (j *job) run() Run {
	return Run{ID: j.id, Kind: j.kind, Status: StatusRunning, Started: j.at}
}

// begin reserves the single backup slot.
func (s *Service) begin(kind Kind) (*job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running != nil {
		return nil, ErrBusy
	}
	at := s.now()
	s.seq++
	j := &job{s: s, kind: kind, at: at, id: fmt.Sprintf("run-%d-%d", at.UnixNano(), s.seq)}
	s.running = j
	return j, nil
}

// finish takes the snapshot for j and releases the slot.
func (s *Service) finish(j *job, ctx context.Context) Result {
	key, err := s.run(ctx, j.kind, j.at)
	j.err = err
	res := Result{Kind: j.kind, Key: key, At: j.at, Err: err, ID: j.id, Finished: s.now()}
	s.mu.Lock()
	s.running = nil
	s.last = &res
	s.mu.Unlock()
	return res
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *Service) run(ctx context.Context, kind Kind, at time.Time) (string, error) {
	dir, err := os.MkdirTemp(s.TempDir, "snapshot-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(dir)

	plain := filepath.Join(dir, "snapshot.sqlite")
	if _, err := s.DB.ExecContext(ctx, "VACUUM INTO ?", plain); err != nil {
		return "", fmt.Errorf("snapshot database: %w", err)
	}
	enc := filepath.Join(dir, "snapshot.sqlite.age")
	if err := encryptFile(plain, enc, s.Recipient); err != nil {
		return "", err
	}
	os.Remove(plain) // plaintext leaves disk as soon as it is encrypted

	f, err := os.Open(enc)
	if err != nil {
		return "", err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return "", err
	}
	key := keyFor(kind, at)
	if err := s.Bucket.Put(ctx, key, f, st.Size()); err != nil {
		return "", fmt.Errorf("upload snapshot: %w", err)
	}
	if err := s.Prune(ctx, kind); err != nil {
		return key, fmt.Errorf("prune %s snapshots: %w", kind, err)
	}
	return key, nil
}

func encryptFile(src, dst string, rcpt age.Recipient) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	w, err := age.Encrypt(out, rcpt)
	if err != nil {
		out.Close()
		return err
	}
	if _, err := io.Copy(w, in); err != nil {
		out.Close()
		return err
	}
	if err := w.Close(); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// Prune deletes the oldest snapshots of kind beyond its retention.
func (s *Service) Prune(ctx context.Context, kind Kind) error {
	keep, ok := Retention[kind]
	if !ok {
		return nil
	}
	objs, err := s.List(ctx, kind)
	if err != nil {
		return err
	}
	for _, o := range objs[min(keep, len(objs)):] { // newest first
		if err := s.Bucket.Delete(ctx, o.Key); err != nil {
			return err
		}
	}
	return nil
}

// List returns the snapshots of kind, newest first. Objects whose names don't
// parse are ignored (and so never pruned).
func (s *Service) List(ctx context.Context, kind Kind) ([]Object, error) {
	objs, err := s.Bucket.List(ctx, string(kind)+"/")
	if err != nil {
		return nil, err
	}
	out := objs[:0:0]
	for _, o := range objs {
		if t, ok := parseKey(o.Key); ok {
			o.Time = t
			out = append(out, o)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Time.After(out[j].Time) })
	return out, nil
}

// Decrypt writes the plaintext of an age-encrypted snapshot to w using the
// private key. Only restore tooling calls this, never the server.
func Decrypt(w io.Writer, enc io.Reader, identities ...age.Identity) error {
	r, err := age.Decrypt(enc, identities...)
	if err != nil {
		return fmt.Errorf("decrypt snapshot: %w", err)
	}
	_, err = io.Copy(w, r)
	return err
}

// RestoreFile decrypts the snapshot at src into a new database file at dst
// (which must not exist). Callers should then run VerifyFile.
func RestoreFile(ctx context.Context, src, dst string, identities ...age.Identity) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("create %s (it must not already exist): %w", dst, err)
	}
	if err := Decrypt(out, in, identities...); err != nil {
		out.Close()
		os.Remove(dst)
		return err
	}
	return out.Close()
}

// VerifyFile opens the database at path read-only and runs PRAGMA
// integrity_check.
func VerifyFile(ctx context.Context, path string) error {
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		return err
	}
	defer db.Close()
	var res string
	if err := db.QueryRowContext(ctx, "PRAGMA integrity_check").Scan(&res); err != nil {
		return fmt.Errorf("integrity check: %w", err)
	}
	if res != "ok" {
		return fmt.Errorf("integrity check failed: %s", res)
	}
	return nil
}

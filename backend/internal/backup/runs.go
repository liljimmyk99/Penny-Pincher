package backup

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"path"
	"sort"
	"strings"
	"time"
)

// Status is where a Run stands.
type Status string

const (
	StatusRunning   Status = "running"
	StatusSucceeded Status = "succeeded"
	StatusFailed    Status = "failed"
)

// Errors for the admin download path.
var (
	ErrNotFound = errors.New("backup not found")
	ErrNotReady = errors.New("backup is not ready to download")
)

// Run is one backup as the admin panel shows it. Stored snapshots have an
// opaque id derived from their bucket key; the running or failed run in this
// process has a "run-" id and no download.
type Run struct {
	ID       string
	Kind     Kind
	Status   Status
	Started  time.Time
	Finished *time.Time
	Size     *int64
	// Error is a short, fixed reason for a failed run. Never the error text,
	// which could carry bucket or path details.
	Error string
}

const failedMessage = "The backup failed. Check the server logs."

func idForKey(key string) string { return base64.RawURLEncoding.EncodeToString([]byte(key)) }

func keyForID(id string) (string, bool) {
	b, err := base64.RawURLEncoding.DecodeString(id)
	if err != nil {
		return "", false
	}
	return string(b), true
}

func knownKind(k Kind) bool { return k == Weekly || k == Monthly || k == Manual }

func (s *Service) runFromResult(r Result) Run {
	fin := r.Finished
	out := Run{ID: r.ID, Kind: r.Kind, Started: r.At, Finished: &fin, Status: StatusSucceeded}
	if r.Err != nil {
		out.Status, out.Error = StatusFailed, failedMessage
	}
	return out
}

// LastRun returns the most recent run in this process (running, or the last to
// finish), or nil if none has started. A succeeded run carries its stored
// snapshot's id and size when the snapshot can be found.
func (s *Service) LastRun(ctx context.Context) *Run {
	s.mu.Lock()
	cur, last := s.running, s.last
	s.mu.Unlock()
	if cur != nil {
		r := cur.run()
		return &r
	}
	if last == nil {
		return nil
	}
	r := s.runFromResult(*last)
	if r.Status == StatusSucceeded && last.Key != "" {
		r.ID = idForKey(last.Key)
		if o, ok := s.find(ctx, last.Key); ok {
			r.Size = &o.Size
		}
	}
	return &r
}

// Runs lists every known backup, newest first: the stored snapshots of all
// kinds, plus this process's running or failed run (which has no snapshot).
func (s *Service) Runs(ctx context.Context) ([]Run, error) {
	var out []Run
	have := map[string]bool{}
	for _, k := range []Kind{Weekly, Monthly, Manual} {
		objs, err := s.List(ctx, k)
		if err != nil {
			return nil, err
		}
		for _, o := range objs {
			size := o.Size
			t := o.Time
			have[o.Key] = true
			out = append(out, Run{ID: idForKey(o.Key), Kind: k, Status: StatusSucceeded, Started: o.Time, Finished: &t, Size: &size})
		}
	}
	s.mu.Lock()
	cur, last := s.running, s.last
	s.mu.Unlock()
	if cur != nil {
		out = append(out, cur.run())
	}
	if last != nil && last.Err != nil && (last.Key == "" || !have[last.Key]) {
		out = append(out, s.runFromResult(*last))
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Started.After(out[j].Started) })
	return out, nil
}

func (s *Service) find(ctx context.Context, key string) (Object, bool) {
	kind := Kind(strings.SplitN(key, "/", 2)[0])
	if !knownKind(kind) {
		return Object{}, false
	}
	objs, err := s.List(ctx, kind)
	if err != nil {
		return Object{}, false
	}
	for _, o := range objs {
		if o.Key == key {
			return o, true
		}
	}
	return Object{}, false
}

// Download is an encrypted snapshot ready to stream.
type Download struct {
	Body io.ReadCloser
	Name string // suggested file name
	Size int64
}

// Open returns the stored, still-encrypted snapshot for a run id. Only keys
// that the listing shows can be fetched, so an id can't reach other objects.
// The server never decrypts.
func (s *Service) Open(ctx context.Context, id string) (Download, error) {
	if strings.HasPrefix(id, "run-") {
		s.mu.Lock()
		cur, last := s.running, s.last
		s.mu.Unlock()
		if (cur != nil && cur.id == id) || (last != nil && last.ID == id) {
			return Download{}, ErrNotReady
		}
		return Download{}, ErrNotFound
	}
	key, ok := keyForID(id)
	if !ok {
		return Download{}, ErrNotFound
	}
	o, ok := s.find(ctx, key)
	if !ok {
		return Download{}, ErrNotFound
	}
	body, err := s.Bucket.Get(ctx, o.Key)
	if err != nil {
		return Download{}, fmt.Errorf("get snapshot: %w", err)
	}
	return Download{Body: body, Name: path.Base(o.Key), Size: o.Size}, nil
}

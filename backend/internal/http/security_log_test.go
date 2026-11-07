package http

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"
	"testing"

	"github.com/liljimmyk99/penny-pincher/backend/internal/logging"
)

type lockedBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (l *lockedBuffer) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.Write(p)
}

func (l *lockedBuffer) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.String()
}

// captureLogs points slog's default at the redacting JSON logger over a
// buffer for the rest of the test.
func captureLogs(t *testing.T) *lockedBuffer {
	t.Helper()
	b := &lockedBuffer{}
	old := slog.Default()
	slog.SetDefault(logging.New(b, "info"))
	t.Cleanup(func() { slog.SetDefault(old) })
	return b
}

// events returns the logged lines whose "event" is ev.
func events(t *testing.T, b *lockedBuffer, ev string) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, l := range strings.Split(strings.TrimSpace(b.String()), "\n") {
		if l == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(l), &m); err != nil {
			t.Fatalf("log line is not JSON: %q", l)
		}
		if m["event"] == ev {
			out = append(out, m)
		}
	}
	return out
}

func TestBackupStartAndDownloadAreLoggedAsAdminActions(t *testing.T) {
	logs := captureLogs(t)
	a := newBackupAPI(t, nil)
	var adminID string
	if err := a.db.QueryRow(`SELECT id FROM users WHERE firebase_uid = 'uid-admin'`).Scan(&adminID); err != nil {
		t.Fatal(err)
	}
	// Some financial data in the database, which must not reach the log.
	a.createExpense(tokAdmin, a.expenseBody(tokAdmin, "2026-11-02", 4321, "Acme Grocer"))

	rec := a.call("POST", "/v1/admin/backups", tokAdmin, "")
	if rec.Code != 202 {
		t.Fatalf("start = %d %s", rec.Code, rec.Body)
	}
	runID := decodeBackup(t, rec.Body.Bytes()).Id
	waitFor(t, func() bool {
		items := listBackups(t, a.testAPI)
		return len(items) == 1 && items[0].Status == "succeeded"
	})
	id := listBackups(t, a.testAPI)[0].Id
	if dl := a.call("GET", "/v1/admin/backups/"+id+"/download", tokAdmin, ""); dl.Code != 200 {
		t.Fatalf("download = %d", dl.Code)
	}
	// Refused or failed attempts are not admin actions.
	a.call("GET", "/v1/admin/backups/nope/download", tokAdmin, "")
	a.call("POST", "/v1/admin/backups", tokMember, "")

	got := events(t, logs, logging.EventAdminAction)
	if len(got) != 2 {
		t.Fatalf("want 2 admin actions, got %v", got)
	}
	for i, want := range [][2]string{{logging.ActionBackupStarted, runID}, {logging.ActionBackupDownloaded, id}} {
		l := got[i]
		if l["action"] != want[0] || l["user_id"] != adminID || l["backup_id"] != want[1] || l["level"] != "INFO" {
			t.Errorf("line %d = %v, want %s by %s on %s", i, l, want[0], adminID, want[1])
		}
	}
	if n := len(events(t, logs, logging.EventAuthFailure)); n != 1 {
		t.Errorf("want the member's refusal logged once, got %d", n)
	}
	out := logs.String()
	for _, bad := range []string{tokAdmin, tokMember, "Acme", "4321", "43.21"} {
		if strings.Contains(out, bad) {
			t.Errorf("log leaked %q: %s", bad, out)
		}
	}
}

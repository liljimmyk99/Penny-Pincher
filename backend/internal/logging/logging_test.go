package logging

import (
	"bytes"
	"strings"
	"testing"
)

func TestRedactsSensitiveKeys(t *testing.T) {
	var b bytes.Buffer
	l := New(&b, "info").With("merchant_name", "Acme")
	l.Info("x", "amount_cents", 1234, "note", "lunch", "Authorization", "Bearer abc", "path", "/healthz")
	out := b.String()
	for _, bad := range []string{"1234", "lunch", "Bearer", "Acme"} {
		if strings.Contains(out, bad) {
			t.Errorf("log leaked %q: %s", bad, out)
		}
	}
	if !strings.Contains(out, "/healthz") {
		t.Errorf("expected safe attr kept: %s", out)
	}
}

// The security-event attributes must survive redaction (a key that happens to
// contain "net" or "token" would be blanked), and their values carry no
// sensitive data of their own.
func TestSecurityEventAttributesAreKept(t *testing.T) {
	var b bytes.Buffer
	New(&b, "info").Warn("auth failure",
		"event", EventAuthFailure, "reason", ReasonInvalidToken, "status", 401,
		"ip", "198.51.100.7", "method", "GET", "path", "/v1/me",
		"uid", "uid-1", "user_id", "7", "action", ActionBackupStarted, "backup_id", "b-1",
		"token", "eyJ-secret", "note", "rent")
	out := b.String()
	for _, want := range []string{`"event":"auth_failure"`, `"reason":"invalid_token"`, `"status":401`,
		`"ip":"198.51.100.7"`, `"method":"GET"`, `"path":"/v1/me"`, `"uid":"uid-1"`, `"user_id":"7"`,
		`"action":"backup_started"`, `"backup_id":"b-1"`} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %s in %s", want, out)
		}
	}
	for _, bad := range []string{"eyJ-secret", "rent"} {
		if strings.Contains(out, bad) {
			t.Errorf("log leaked %q: %s", bad, out)
		}
	}
}

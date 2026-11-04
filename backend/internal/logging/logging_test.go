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

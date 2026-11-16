// Package logging builds the structured logger. Financial data (amounts,
// merchants, notes) and tokens must never be logged; a redacting handler
// drops any attribute with a sensitive key as a safety net.
package logging

import (
	"context"
	"io"
	"log/slog"
	"strings"
)

var sensitive = []string{"amount", "cents", "gross", "net", "merchant", "note", "token", "authorization", "password", "secret"}

func isSensitive(key string) bool {
	k := strings.ToLower(key)
	for _, s := range sensitive {
		if strings.Contains(k, s) {
			return true
		}
	}
	return false
}

type redactHandler struct{ slog.Handler }

func (h redactHandler) Handle(ctx context.Context, r slog.Record) error {
	nr := slog.NewRecord(r.Time, r.Level, r.Message, r.PC)
	r.Attrs(func(a slog.Attr) bool {
		nr.AddAttrs(redact(a))
		return true
	})
	return h.Handler.Handle(ctx, nr)
}

func (h redactHandler) WithAttrs(as []slog.Attr) slog.Handler {
	out := make([]slog.Attr, len(as))
	for i, a := range as {
		out[i] = redact(a)
	}
	return redactHandler{h.Handler.WithAttrs(out)}
}

func (h redactHandler) WithGroup(n string) slog.Handler { return redactHandler{h.Handler.WithGroup(n)} }

func redact(a slog.Attr) slog.Attr {
	if isSensitive(a.Key) {
		return slog.String(a.Key, "[redacted]")
	}
	return a
}

// New returns a JSON logger at the given level (debug|info|warn|error).
func New(w io.Writer, level string) *slog.Logger {
	var l slog.Level
	_ = l.UnmarshalText([]byte(level))
	return slog.New(redactHandler{slog.NewJSONHandler(w, &slog.HandlerOptions{Level: l})})
}

// Security events (AGENTS.md section 8, docs/security.md). Each is one log
// line whose "event" attribute is one of these, so the alert check and anyone
// reading the logs can find them. They carry who, where and why, never a
// token, a query string or any financial data.
const (
	// EventAuthFailure is a refused request: a missing, invalid or revoked
	// token, an expired session, an account not on the allowlist, or a
	// member on an admin route. Attributes: reason, status, ip, method, path,
	// and uid (Firebase) and user_id when known.
	EventAuthFailure = "auth_failure"
	// EventAdminAction is something an admin did: start or download a
	// backup. Attributes: action, user_id, backup_id.
	EventAdminAction = "admin_action"
)

// Reasons for EventAuthFailure.
const (
	ReasonMissingToken   = "missing_token"
	ReasonInvalidToken   = "invalid_token" // bad, expired, revoked, or the account is disabled or deleted
	ReasonSessionExpired = "session_expired"
	ReasonNotAllowlisted = "not_allowlisted"
	ReasonAdminRequired  = "admin_required"
)

// Actions for EventAdminAction.
const (
	ActionBackupStarted    = "backup_started"
	ActionBackupDownloaded = "backup_downloaded"
	ActionUserAdded        = "user_added"
)

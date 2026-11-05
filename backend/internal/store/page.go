package store

import (
	"encoding/base64"
	"strings"
)

// Page asks for one page of a cursor-paginated list.
type Page struct {
	Limit  int    // 0 means DefaultLimit
	Cursor string // "" for the first page; otherwise a cursor the store returned
}

// Page sizes from the spec's Limit parameter.
const (
	DefaultLimit = 200
	MaxLimit     = 1000
)

func (p Page) limit() (int, error) {
	switch {
	case p.Limit == 0:
		return DefaultLimit, nil
	case p.Limit < 1 || p.Limit > MaxLimit:
		return 0, invalid("limit", "must be between 1 and 1000")
	}
	return p.Limit, nil
}

// Cursors are opaque to clients: the sort key of the last row returned, as
// unit-separated fields, base64url-encoded.
const cursorSep = "\x1f"

func encodeCursor(fields ...string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strings.Join(fields, cursorSep)))
}

// decodeCursor returns the cursor's n fields, or a validation error.
func decodeCursor(c string, n int) ([]string, error) {
	b, err := base64.RawURLEncoding.DecodeString(c)
	if err != nil {
		return nil, invalid("cursor", "is not valid")
	}
	parts := strings.Split(string(b), cursorSep)
	if len(parts) != n {
		return nil, invalid("cursor", "is not valid")
	}
	return parts, nil
}

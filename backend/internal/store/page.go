package store

import (
	"encoding/base64"
	"strings"
	"time"
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

// dateBounds checks a list's month or from/to filter and returns the inclusive
// date range it selects ("" for an open end). month cannot be combined with
// from or to; empty strings mean no filter.
func dateBounds(month, from, to string) (string, string, error) {
	if month != "" {
		if from != "" || to != "" {
			return "", "", invalid("month", "cannot be combined with from or to")
		}
		if _, err := time.Parse("2006-01", month); err != nil || len(month) != 7 {
			return "", "", invalid("month", "must be YYYY-MM")
		}
		// Dates are YYYY-MM-DD text, so this range is the whole month.
		return month + "-01", month + "-31", nil
	}
	for _, b := range []struct{ v, field string }{{from, "from"}, {to, "to"}} {
		if b.v != "" {
			if err := checkDate(b.v, b.field); err != nil {
				return "", "", err
			}
		}
	}
	if from != "" && to != "" && from > to {
		return "", "", invalid("from", "must not be after to")
	}
	return from, to, nil
}

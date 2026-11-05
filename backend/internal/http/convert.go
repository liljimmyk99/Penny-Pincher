package http

import (
	"context"
	"strconv"
	"time"

	"github.com/oapi-codegen/nullable"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/liljimmyk99/penny-pincher/backend/internal/api"
	"github.com/liljimmyk99/penny-pincher/backend/internal/auth"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

// nullableOf turns a pointer into a response field that is always present:
// the value, or JSON null. (An unset Nullable would marshal as the zero value.)
func nullableOf[T any](p *T) nullable.Nullable[T] {
	if p == nil {
		return nullable.NewNullNullable[T]()
	}
	return nullable.NewNullableWithValue(*p)
}

// userID returns the authenticated user's id. The auth middleware guarantees
// an identity on every /v1 route; ok is false only if it did not run.
func userID(ctx context.Context) (int64, bool) {
	id, ok := auth.FromContext(ctx)
	if !ok {
		return 0, false
	}
	n, err := strconv.ParseInt(id.ID, 10, 64)
	return n, err == nil
}

// parseID parses an opaque path or body id. Anything that is not one of our
// ids is reported as not found (or invalid, for bodies) by the caller.
func parseID(s string) (int64, bool) {
	n, err := strconv.ParseInt(s, 10, 64)
	return n, err == nil && n > 0
}

// idOrZero parses an id from a body or query. Anything that is not one of our
// ids becomes 0, which never matches a row: the store then rejects it (in a
// body) or matches nothing (as a filter).
func idOrZero(s string) int64 {
	id, _ := parseID(s)
	return id
}

func formatID(n int64) string { return strconv.FormatInt(n, 10) }

// ptrOf reads a request field: nil when it is null or omitted.
func ptrOf[T any](n nullable.Nullable[T]) *T {
	if v, err := n.Get(); err == nil {
		return &v
	}
	return nil
}

// dateString formats a body date. A missing (zero) date becomes "", which the
// store rejects.
func dateString(d openapi_types.Date) string {
	if d.IsZero() {
		return ""
	}
	return d.String()
}

// mustDate parses a YYYY-MM-DD date read from the database, where the schema
// guarantees the format.
func mustDate(s string) time.Time {
	t, _ := time.Parse(time.DateOnly, s)
	return t
}

// pageOf builds a store page request from the Limit and Cursor parameters.
func pageOf(limit *api.Limit, cursor *api.Cursor) store.Page {
	var p store.Page
	if limit != nil {
		p.Limit = *limit
		if p.Limit == 0 {
			p.Limit = -1 // an explicit 0 is out of range, not "use the default"
		}
	}
	if cursor != nil {
		p.Cursor = *cursor
	}
	return p
}

// cursorOf turns the store's next cursor into next_cursor: null on the last page.
func cursorOf(next string) nullable.Nullable[api.NextCursor] {
	if next == "" {
		return nullable.NewNullNullable[api.NextCursor]()
	}
	return nullable.NewNullableWithValue(next)
}

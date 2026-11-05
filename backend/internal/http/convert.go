package http

import (
	"context"
	"strconv"

	"github.com/oapi-codegen/nullable"

	"github.com/liljimmyk99/penny-pincher/backend/internal/auth"
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

func formatID(n int64) string { return strconv.FormatInt(n, 10) }

// ptrOf reads a request field: nil when it is null or omitted.
func ptrOf[T any](n nullable.Nullable[T]) *T {
	if v, err := n.Get(); err == nil {
		return &v
	}
	return nil
}

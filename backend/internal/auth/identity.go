package auth

import "context"

// Role is a user's role in the local users table.
type Role string

const (
	RoleAdmin  Role = "admin"
	RoleMember Role = "member"
)

// Identity is the authenticated user for a request. The session middleware
// puts it in the context.
type Identity struct {
	ID                 string
	Username           string
	Email              *string
	DisplayName        *string
	Role               Role
	MustChangePassword bool
	// SessionID is the sessions row the request's token belongs to.
	SessionID int64
}

type ctxKey struct{}

// WithIdentity returns a context carrying id.
func WithIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

// FromContext returns the request's identity, if authentication has run.
func FromContext(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(ctxKey{}).(Identity)
	return id, ok
}

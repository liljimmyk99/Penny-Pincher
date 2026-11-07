package auth

import (
	"context"
	"errors"
	"time"
)

// ErrInvalidToken is returned by a Verifier for a missing, malformed, expired,
// revoked or otherwise unusable token, including one whose Firebase account is
// disabled or deleted. Any other error from Verify means the check itself
// failed (for example Firebase could not be reached).
var ErrInvalidToken = errors.New("invalid token")

// Claims is what a Verifier extracts from a valid ID token.
type Claims struct {
	UID string // Firebase uid
	// AuthTime is when the user last signed in (the token's auth_time). Token
	// refreshes keep it, so it measures the session's age.
	AuthTime time.Time
}

// Verifier checks a Firebase ID token. The Firebase Admin SDK implementation
// lives in firebase.go; tests use FakeVerifier or FakeClaims.
type Verifier interface {
	Verify(ctx context.Context, idToken string) (Claims, error)
}

// FakeVerifier maps token strings to uids, for tests. Every session it accepts
// has just signed in.
type FakeVerifier map[string]string

// Verify implements Verifier.
func (f FakeVerifier) Verify(_ context.Context, idToken string) (Claims, error) {
	uid, ok := f[idToken]
	if !ok {
		return Claims{}, ErrInvalidToken
	}
	return Claims{UID: uid, AuthTime: time.Now()}, nil
}

// FakeClaims maps token strings to full claims, for tests that need a
// particular sign-in time.
type FakeClaims map[string]Claims

// Verify implements Verifier.
func (f FakeClaims) Verify(_ context.Context, idToken string) (Claims, error) {
	c, ok := f[idToken]
	if !ok {
		return Claims{}, ErrInvalidToken
	}
	return c, nil
}

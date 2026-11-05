package auth

import (
	"context"
	"errors"
)

// ErrInvalidToken is returned by a Verifier for a missing, malformed, expired
// or otherwise unverifiable token.
var ErrInvalidToken = errors.New("invalid token")

// Claims is what a Verifier extracts from a valid ID token.
type Claims struct {
	UID string // Firebase uid
}

// Verifier checks a Firebase ID token. The Firebase Admin SDK implementation
// lives in firebase.go; tests use FakeVerifier.
type Verifier interface {
	Verify(ctx context.Context, idToken string) (Claims, error)
}

// FakeVerifier maps token strings to uids, for tests.
type FakeVerifier map[string]string

// Verify implements Verifier.
func (f FakeVerifier) Verify(_ context.Context, idToken string) (Claims, error) {
	uid, ok := f[idToken]
	if !ok {
		return Claims{}, ErrInvalidToken
	}
	return Claims{UID: uid}, nil
}

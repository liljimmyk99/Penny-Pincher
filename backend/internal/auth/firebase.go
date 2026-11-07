package auth

import (
	"context"
	"fmt"
	"time"

	firebase "firebase.google.com/go/v4"
	fbauth "firebase.google.com/go/v4/auth"
)

type firebaseVerifier struct {
	client  *fbauth.Client
	revoked *RevocationChecker
}

// NewFirebaseVerifier returns a Verifier backed by the Firebase Admin SDK.
// Checking the signature needs only the project id (public signing keys); the
// revocation check reads the account, which needs the service-account
// credentials in GOOGLE_APPLICATION_CREDENTIALS (or the Auth emulator).
func NewFirebaseVerifier(ctx context.Context, projectID string) (Verifier, error) {
	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID})
	if err != nil {
		return nil, fmt.Errorf("firebase app: %w", err)
	}
	c, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("firebase auth: %w", err)
	}
	fetch := func(ctx context.Context, uid string) (AccountState, error) {
		u, err := c.GetUser(ctx, uid)
		if fbauth.IsUserNotFound(err) {
			return AccountState{}, ErrAccountGone
		}
		if err != nil {
			return AccountState{}, err
		}
		s := AccountState{Disabled: u.Disabled}
		if u.TokensValidAfterMillis > 0 {
			s.ValidAfter = time.UnixMilli(u.TokensValidAfterMillis)
		}
		return s, nil
	}
	return firebaseVerifier{client: c, revoked: NewRevocationChecker(fetch, RevocationCacheTTL, time.Now)}, nil
}

// Verify checks the signature, issuer, audience and expiry, then refuses the
// token if its account is disabled, deleted or had its sessions revoked
// (VerifyIDTokenAndCheckRevoked's rules, with the account cached per uid).
func (v firebaseVerifier) Verify(ctx context.Context, idToken string) (Claims, error) {
	t, err := v.client.VerifyIDToken(ctx, idToken)
	if err != nil {
		return Claims{}, ErrInvalidToken
	}
	// Firebase stores the revocation time in whole seconds, as is iat.
	if err := v.revoked.Check(ctx, t.UID, time.Unix(t.IssuedAt, 0)); err != nil {
		return Claims{}, err
	}
	return Claims{UID: t.UID, AuthTime: time.Unix(t.AuthTime, 0)}, nil
}

// RevokeSessions revokes every refresh token of a Firebase account, so it must
// sign in again everywhere. The API refuses its existing ID tokens within
// RevocationCacheTTL. It needs the service-account credentials.
func RevokeSessions(ctx context.Context, projectID, uid string) error {
	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID})
	if err != nil {
		return fmt.Errorf("firebase app: %w", err)
	}
	c, err := app.Auth(ctx)
	if err != nil {
		return fmt.Errorf("firebase auth: %w", err)
	}
	return c.RevokeRefreshTokens(ctx, uid)
}

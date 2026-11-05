package auth

import (
	"context"
	"fmt"

	firebase "firebase.google.com/go/v4"
	fbauth "firebase.google.com/go/v4/auth"
)

type firebaseVerifier struct{ client *fbauth.Client }

// NewFirebaseVerifier returns a Verifier backed by the Firebase Admin SDK.
// Verifying ID tokens needs only the project id (public signing keys), no
// service-account credentials.
func NewFirebaseVerifier(ctx context.Context, projectID string) (Verifier, error) {
	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID})
	if err != nil {
		return nil, fmt.Errorf("firebase app: %w", err)
	}
	c, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("firebase auth: %w", err)
	}
	return firebaseVerifier{client: c}, nil
}

func (v firebaseVerifier) Verify(ctx context.Context, idToken string) (Claims, error) {
	t, err := v.client.VerifyIDToken(ctx, idToken)
	if err != nil {
		return Claims{}, ErrInvalidToken
	}
	return Claims{UID: t.UID}, nil
}

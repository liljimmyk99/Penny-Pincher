package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"

	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

const userUsage = "usage: api user add --uid <firebase-uid> [--email <email>] [--name <display name>] [--role admin|member]\n       api user revoke --uid <firebase-uid>"

// sessionRevoker signs a Firebase account out everywhere (auth.RevokeSessions).
type sessionRevoker func(ctx context.Context, uid string) error

// runUserRevoke handles `api user revoke`: it revokes the account's refresh
// tokens, so it must sign in again (docs/security.md, "Lock someone out now").
func runUserRevoke(ctx context.Context, revoke sessionRevoker, args []string, out io.Writer) error {
	fs := flag.NewFlagSet("user revoke", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	uid := fs.String("uid", "", "Firebase uid (required)")
	if err := fs.Parse(args); err != nil {
		return fmt.Errorf("%w\n%s", err, userUsage)
	}
	if *uid == "" {
		return errors.New("--uid is required\n" + userUsage)
	}
	if err := revoke(ctx, *uid); err != nil {
		return fmt.Errorf("revoke sessions: %w", err)
	}
	fmt.Fprintf(out, "revoked the sessions of %s; the API refuses its current tokens within 5 minutes\n", *uid)
	return nil
}

// runUser handles `api user add`. It is the v1 admin-only way to add accounts
// (after creating them in the Firebase console).
func runUser(ctx context.Context, dbPath string, args []string, out io.Writer) error {
	if len(args) == 0 || args[0] != "add" {
		return errors.New(userUsage)
	}
	fs := flag.NewFlagSet("user add", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	uid := fs.String("uid", "", "Firebase uid (required)")
	email := fs.String("email", "", "email address")
	name := fs.String("name", "", "display name")
	role := fs.String("role", store.RoleMember, "admin or member")
	if err := fs.Parse(args[1:]); err != nil {
		return fmt.Errorf("%w\n%s", err, userUsage)
	}
	if *uid == "" {
		return errors.New("--uid is required\n" + userUsage)
	}

	db, err := store.Open(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := store.Migrate(ctx, db); err != nil {
		return err
	}
	id, err := store.AddUser(ctx, db, store.NewUser{FirebaseUID: *uid, Email: *email, DisplayName: *name, Role: *role})
	if err != nil {
		return err
	}
	fmt.Fprintf(out, "added user %d (%s) with role %s\n", id, *uid, *role)
	return nil
}

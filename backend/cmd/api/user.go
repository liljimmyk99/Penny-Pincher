package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"

	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

const userUsage = "usage: api user add --uid <firebase-uid> [--email <email>] [--name <display name>] [--role admin|member]"

// runUser handles `api user ...`. It is the v1 admin-only way to add accounts
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

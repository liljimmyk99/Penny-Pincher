package main

import (
	"bytes"
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/liljimmyk99/penny-pincher/backend/internal/auth"
	"github.com/liljimmyk99/penny-pincher/backend/internal/store"
)

const cliPassword = "a long enough password"

func runCLI(t *testing.T, path, stdin string, args ...string) (string, error) {
	t.Helper()
	var out bytes.Buffer
	err := runUser(context.Background(), path, args, strings.NewReader(stdin), &out)
	return out.String(), err
}

func TestRunUserAddSetPasswordRevoke(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cli.db")
	args := []string{"add", "--username", "Cli-Admin", "--email", "a@example.com", "--role", "admin"}
	out, err := runCLI(t, path, cliPassword+"\n", args...)
	if err != nil || !strings.Contains(out, "role admin") {
		t.Fatalf("add: %q, %v", out, err)
	}
	if strings.Contains(out, cliPassword) {
		t.Error("the password was printed")
	}
	if _, err := runCLI(t, path, cliPassword+"\n", args...); err == nil {
		t.Error("duplicate add succeeded")
	}
	if _, err := runCLI(t, path, cliPassword+"\n", "add", "--username", "cli-admin"); err == nil {
		t.Error("username is case-sensitive")
	}
	if _, err := runCLI(t, path, cliPassword, "add"); err == nil {
		t.Error("missing --username accepted")
	}
	if _, err := runCLI(t, path, cliPassword, "add", "--username", "x", "--role", "owner"); err == nil {
		t.Error("bad role accepted")
	}
	if _, err := runCLI(t, path, "short\n", "add", "--username", "y"); err == nil {
		t.Error("weak password accepted")
	}
	if _, err := runCLI(t, path, "", "add", "--username", "y"); err == nil {
		t.Error("missing password accepted")
	}

	db, err := store.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	u, err := store.FindUserByUsername(context.Background(), db, "cli-admin")
	if err != nil {
		t.Fatal(err)
	}
	h := auth.NewHasher(auth.TestParams, 1)
	if !h.Verify(cliPassword, u.PasswordHash) {
		t.Fatal("stored hash does not match the password")
	}
	sess := store.Sessions{DB: db}
	tok, _, err := sess.Create(context.Background(), u.ID)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := runCLI(t, path, "another long password\n", "set-password", "--username", "cli-admin", "--must-change"); err != nil {
		t.Fatal(err)
	}
	if _, err := sess.Lookup(context.Background(), tok); err == nil {
		t.Error("set-password left the old session alive")
	}
	u, _ = store.FindUserByUsername(context.Background(), db, "cli-admin")
	if !h.Verify("another long password", u.PasswordHash) || !u.MustChangePassword {
		t.Error("set-password did not store the new password and flag")
	}
	if _, err := runCLI(t, path, "another long password\n", "set-password", "--username", "nobody"); err == nil {
		t.Error("set-password for an unknown user succeeded")
	}

	tok, _, _ = sess.Create(context.Background(), u.ID)
	if out, err := runCLI(t, path, "", "revoke", "--username", "cli-admin"); err != nil || !strings.Contains(out, "signed") {
		t.Fatalf("revoke: %q, %v", out, err)
	}
	if _, err := sess.Lookup(context.Background(), tok); err == nil {
		t.Error("revoke left the session alive")
	}
}

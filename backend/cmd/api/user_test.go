package main

import (
	"bytes"
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunUserAdd(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cli.db")
	var out bytes.Buffer
	args := []string{"add", "--uid", "uid-cli", "--email", "a@example.com", "--role", "admin"}
	if err := runUser(context.Background(), path, args, &out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "role admin") {
		t.Errorf("output = %q", out.String())
	}
	if err := runUser(context.Background(), path, args, &out); err == nil {
		t.Error("duplicate add succeeded")
	}
	if err := runUser(context.Background(), path, []string{"add"}, &out); err == nil {
		t.Error("missing --uid accepted")
	}
	if err := runUser(context.Background(), path, []string{"add", "--uid", "x", "--role", "owner"}, &out); err == nil {
		t.Error("bad role accepted")
	}
}

func TestRunUserRevoke(t *testing.T) {
	var got []string
	revoke := func(_ context.Context, uid string) error { got = append(got, uid); return nil }
	var out bytes.Buffer
	if err := runUserRevoke(context.Background(), revoke, []string{"--uid", "uid-lost"}, &out); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0] != "uid-lost" || !strings.Contains(out.String(), "revoked") {
		t.Fatalf("revoked %v, output %q", got, out.String())
	}
	if err := runUserRevoke(context.Background(), revoke, nil, &out); err == nil {
		t.Error("missing --uid accepted")
	}
	failing := func(context.Context, string) error { return errors.New("boom") }
	if err := runUserRevoke(context.Background(), failing, []string{"--uid", "x"}, &out); err == nil {
		t.Error("a Firebase failure was not reported")
	}
}

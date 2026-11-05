package main

import (
	"bytes"
	"context"
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

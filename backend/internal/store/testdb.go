package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

// NewTestDB returns a fresh temporary database with all migrations applied.
// It is closed and deleted when the test ends.
func NewTestDB(t testing.TB) *sql.DB {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	return db
}

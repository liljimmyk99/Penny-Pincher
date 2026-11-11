package store

import (
	"context"
	"testing"
)

func TestPragmas(t *testing.T) {
	db := NewTestDB(t)
	// Use several pooled connections to prove the DSN applies to each.
	for i := 0; i < 3; i++ {
		conn, err := db.Conn(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()
		check := func(pragma string, want any) {
			var got any
			if err := conn.QueryRowContext(context.Background(), "PRAGMA "+pragma).Scan(&got); err != nil {
				t.Fatal(err)
			}
			if got != want {
				t.Errorf("%s = %v, want %v", pragma, got, want)
			}
		}
		check("foreign_keys", int64(1))
		check("journal_mode", "wal")
		check("busy_timeout", int64(5000))
		check("synchronous", int64(1))
	}
}

func TestMigrateIdempotent(t *testing.T) {
	db := NewTestDB(t)
	if err := Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM schema_migrations`).Scan(&n); err != nil || n != 2 {
		t.Fatalf("applied = %d, %v", n, err)
	}
}

func TestNewUserTriggerSeedsProtectedRows(t *testing.T) {
	db := NewTestDB(t)
	res, err := db.Exec(`INSERT INTO users (firebase_uid) VALUES ('uid-1')`)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()

	var name string
	var saving int
	err = db.QueryRow(`SELECT name, is_saving FROM categories WHERE user_id = ? AND is_protected = 1`, id).Scan(&name, &saving)
	if err != nil || name != "Other" || saving != 0 {
		t.Fatalf("category = %q saving=%d, %v", name, saving, err)
	}
	err = db.QueryRow(`SELECT name FROM income_sources WHERE user_id = ? AND is_protected = 1`, id).Scan(&name)
	if err != nil || name != "Other" {
		t.Fatalf("income source = %q, %v", name, err)
	}
}

package store

import (
	"context"
	"path/filepath"
	"strconv"
	"testing"
	"testing/fstest"

	"github.com/liljimmyk99/penny-pincher/backend/internal/auth"
	"github.com/liljimmyk99/penny-pincher/backend/migrations"
)

// 0003 rebuilds `users` on a database that already holds users and their data.
func TestMigrate0003KeepsDataAndSeeding(t *testing.T) {
	ctx := context.Background()
	db, err := Open(filepath.Join(t.TempDir(), "old.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	old := fstest.MapFS{}
	for _, n := range []string{"0001_init.sql", "0002_imports.sql"} {
		b, err := migrations.FS.ReadFile(n)
		if err != nil {
			t.Fatal(err)
		}
		old[n] = &fstest.MapFile{Data: b}
	}
	if err := migrate(ctx, db, old); err != nil {
		t.Fatal(err)
	}
	// Two users from the Firebase era, each with a category (from the trigger),
	// a custom category, a merchant and an expense.
	var ids []int64
	for _, uid := range []string{"fb-1", "fb-2"} {
		res, err := db.Exec(`INSERT INTO users (firebase_uid, email, role) VALUES (?, ?, 'admin')`, uid, uid+"@example.com")
		if err != nil {
			t.Fatal(err)
		}
		id, _ := res.LastInsertId()
		ids = append(ids, id)
		if _, err := db.Exec(`INSERT INTO categories (user_id, name) VALUES (?, 'Food')`, id); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`INSERT INTO merchants (user_id, name) VALUES (?, 'Shop')`, id); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`INSERT INTO expenses (user_id, category_id, merchant_id, occurred_on, amount_cents)
			VALUES (?, (SELECT id FROM categories WHERE user_id = ? AND name = 'Food'),
			        (SELECT id FROM merchants WHERE user_id = ?), '2026-01-02', 500)`, id, id, id); err != nil {
			t.Fatal(err)
		}
	}

	if err := Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}

	// Every row survived: the rebuild did not cascade.
	for _, table := range []string{"categories", "merchants", "expenses", "income_sources"} {
		var n int
		if err := db.QueryRow(`SELECT count(*) FROM ` + table).Scan(&n); err != nil || n < 2 {
			t.Fatalf("%s rows after migration = %d, %v", table, n, err)
		}
	}
	var fk int
	if err := db.QueryRow(`PRAGMA foreign_keys`).Scan(&fk); err != nil || fk != 1 {
		t.Fatalf("foreign_keys = %d, %v after migration", fk, err)
	}

	// Existing users: placeholder username, unusable password, same id, role and email.
	h := auth.NewHasher(auth.TestParams, 1)
	for i, id := range ids {
		u, err := FindUserByID(ctx, db, id)
		if err != nil {
			t.Fatal(err)
		}
		if u.Username != "user-"+formatInt(id) || u.Role != RoleAdmin || u.Email == nil || u.MustChangePassword {
			t.Fatalf("user %d = %+v", i, u)
		}
		for _, pw := range []string{"", "!", "anything at all, really"} {
			if h.Verify(pw, u.PasswordHash) {
				t.Fatalf("the placeholder hash accepted %q", pw)
			}
		}
	}
	// `set-password` works on them, and the username is case-insensitive.
	hash, _ := h.Hash("a brand new password")
	if err := SetPassword(ctx, db, ids[0], hash, false); err != nil {
		t.Fatal(err)
	}
	u, err := FindUserByUsername(ctx, db, "USER-"+formatInt(ids[0]))
	if err != nil || !h.Verify("a brand new password", u.PasswordHash) {
		t.Fatalf("lookup after set-password: %+v, %v", u, err)
	}

	// The seed trigger and the other triggers still work: a new user gets
	// "Other", and the protected category still can't be deleted.
	newID, err := AddUser(ctx, db, NewUser{Username: "fresh", PasswordHash: hash, Role: RoleMember})
	if err != nil {
		t.Fatal(err)
	}
	var other int
	if err := db.QueryRow(`SELECT count(*) FROM categories WHERE user_id = ? AND name = 'Other' AND is_protected = 1`, newID).Scan(&other); err != nil || other != 1 {
		t.Fatalf("Other category = %d, %v", other, err)
	}
	if _, err := db.Exec(`DELETE FROM categories WHERE user_id = ? AND is_protected = 1`, newID); err == nil {
		t.Fatal("the protected category was deleted")
	}
	if _, err := AddUser(ctx, db, NewUser{Username: "FRESH", PasswordHash: hash, Role: RoleMember}); err == nil {
		t.Fatal("a username differing only by case was accepted")
	}

	// Sessions cascade with the user, and foreign keys are enforced.
	tok, _, err := (Sessions{DB: db}).Create(ctx, newID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := (Sessions{DB: db}).Lookup(ctx, tok); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`DELETE FROM users WHERE id = ?`, newID); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM sessions`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("sessions left after the user was removed: %d, %v", n, err)
	}
	if _, err := db.Exec(`INSERT INTO sessions (user_id, token_hash) VALUES (999999, x'00')`); err == nil {
		t.Fatal("a session for a missing user was accepted")
	}
}

func formatInt(n int64) string { return strconv.FormatInt(n, 10) }

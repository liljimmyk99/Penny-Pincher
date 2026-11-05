package store

import (
	"context"
	"errors"
	"testing"
)

func TestAddUserSeedsDefaults(t *testing.T) {
	db := NewTestDB(t)
	ctx := context.Background()
	id, err := AddUser(ctx, db, NewUser{FirebaseUID: "uid-admin", Email: "admin@example.com", Role: RoleAdmin})
	if err != nil {
		t.Fatal(err)
	}

	var role string
	if err := db.QueryRow(`SELECT role FROM users WHERE id = ?`, id).Scan(&role); err != nil || role != "admin" {
		t.Fatalf("role = %q, %v", role, err)
	}

	rows, err := db.Query(`SELECT name, is_saving, is_protected FROM categories WHERE user_id = ? ORDER BY sort_order, id`, id)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	type cat struct {
		name           string
		saving, protec bool
	}
	var got []cat
	for rows.Next() {
		var c cat
		if err := rows.Scan(&c.name, &c.saving, &c.protec); err != nil {
			t.Fatal(err)
		}
		got = append(got, c)
	}
	want := []cat{
		{"Saving", true, false}, {"Housing", false, false}, {"Utilities", false, false},
		{"Food", false, false}, {"Transportation", false, false}, {"Entertainment", false, false},
		{"Debt", false, false}, {"Other", false, true},
	}
	if len(got) != len(want) {
		t.Fatalf("categories = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("category %d = %v, want %v", i, got[i], want[i])
		}
	}

	var src string
	var protected bool
	if err := db.QueryRow(`SELECT name, is_protected FROM income_sources WHERE user_id = ?`, id).Scan(&src, &protected); err != nil || src != "Other" || !protected {
		t.Fatalf("income source = %q protected=%v, %v", src, protected, err)
	}

	var tmpls, items int
	db.QueryRow(`SELECT count(*) FROM templates WHERE user_id = ?`, id).Scan(&tmpls)
	db.QueryRow(`SELECT (SELECT count(*) FROM template_expense_items WHERE user_id = ?) + (SELECT count(*) FROM template_income_items WHERE user_id = ?)`, id, id).Scan(&items)
	if tmpls != 1 || items != 0 {
		t.Fatalf("templates = %d, items = %d; want 1 empty template", tmpls, items)
	}
}

func TestAddUserIsolatedAndRejectsDuplicates(t *testing.T) {
	db := NewTestDB(t)
	ctx := context.Background()
	a, err := AddUser(ctx, db, NewUser{FirebaseUID: "uid-a", Role: RoleMember})
	if err != nil {
		t.Fatal(err)
	}
	b, err := AddUser(ctx, db, NewUser{FirebaseUID: "uid-b", Role: RoleMember})
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []int64{a, b} {
		var n int
		db.QueryRow(`SELECT count(*) FROM categories WHERE user_id = ?`, id).Scan(&n)
		if n != 8 {
			t.Errorf("user %d has %d categories, want 8", id, n)
		}
	}
	if _, err := AddUser(ctx, db, NewUser{FirebaseUID: "uid-a", Role: RoleAdmin}); !errors.Is(err, ErrUserExists) {
		t.Fatalf("duplicate err = %v", err)
	}
}

func TestAddUserValidationAndRollback(t *testing.T) {
	db := NewTestDB(t)
	ctx := context.Background()
	if _, err := AddUser(ctx, db, NewUser{FirebaseUID: "", Role: RoleAdmin}); err == nil {
		t.Error("empty uid accepted")
	}
	if _, err := AddUser(ctx, db, NewUser{FirebaseUID: "x", Role: "owner"}); err == nil {
		t.Error("bad role accepted")
	}
	// A seeding failure must leave no user behind.
	if _, err := db.Exec(`DROP TABLE templates`); err == nil {
		if _, err := AddUser(ctx, db, NewUser{FirebaseUID: "uid-r", Role: RoleMember}); err == nil {
			t.Fatal("expected seeding failure")
		}
		var n int
		db.QueryRow(`SELECT count(*) FROM users`).Scan(&n)
		if n != 0 {
			t.Fatalf("users = %d after failed seed, want 0", n)
		}
	}
}

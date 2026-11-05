package store

import (
	"errors"

	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

// Errors the store returns for business rules. The HTTP layer maps them to the
// spec's error codes; messages are safe to show.
var (
	// ErrNotFound: no such row for this user (another user's rows included).
	ErrNotFound = errors.New("not found")
	// ErrProtected: the change would edit or delete a protected "Other" row.
	ErrProtected = errors.New("protected resource")
	// ErrNameTaken: another row of the same kind already has this name
	// (case-insensitively).
	ErrNameTaken = errors.New("name taken")
)

// ValidationError is an input that fails a rule (400 invalid_request).
type ValidationError struct {
	Field string
	Issue string
}

func (e *ValidationError) Error() string { return e.Field + " " + e.Issue }

func invalid(field, issue string) error { return &ValidationError{Field: field, Issue: issue} }

// sqliteCode returns the extended SQLite result code of err, or 0.
func sqliteCode(err error) int {
	var se *sqlite.Error
	if errors.As(err, &se) {
		return se.Code()
	}
	return 0
}

// mapConstraint turns constraint failures that slipped past the store's own
// checks (a race, or a trigger acting as the safety net) into store errors.
func mapConstraint(err error) error {
	switch sqliteCode(err) {
	case sqlite3.SQLITE_CONSTRAINT_UNIQUE:
		return ErrNameTaken
	case sqlite3.SQLITE_CONSTRAINT_TRIGGER:
		return ErrProtected
	}
	return err
}

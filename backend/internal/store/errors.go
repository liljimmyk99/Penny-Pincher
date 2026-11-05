package store

import (
	"errors"
	"strconv"
	"strings"

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
	// ErrSourceHasEntries: the income source has income entries, so it can
	// only be renamed, never deleted.
	ErrSourceHasEntries = errors.New("income source has entries")
	// ErrInvalidRefundLink: refunded_expense_id is set on a non-negative
	// amount, or does not name one of the user's positive expenses.
	ErrInvalidRefundLink = errors.New("invalid refund link")
	// ErrHasLinkedRefunds: the expense has refunds pointing at it, so its
	// amount cannot become negative.
	ErrHasLinkedRefunds = errors.New("expense has linked refunds")
)

// BatchItemError reports which item of a batch failed. Nothing in the batch
// was saved.
type BatchItemError struct {
	Index int
	Err   error
}

func (e *BatchItemError) Error() string {
	return "item " + strconv.Itoa(e.Index) + ": " + e.Err.Error()
}
func (e *BatchItemError) Unwrap() error { return e.Err }

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
		// Every RAISE(ABORT) guards a protected row, except the ones for income
		// sources with entries and for refund links (0001_init.sql).
		msg := err.Error()
		switch {
		case strings.Contains(msg, "with income entries cannot be deleted"):
			return ErrSourceHasEntries
		case strings.Contains(msg, "refunded_expense_id must reference"):
			return ErrInvalidRefundLink
		case strings.Contains(msg, "with linked refunds cannot have a negative amount"):
			return ErrHasLinkedRefunds
		}
		return ErrProtected
	}
	return err
}

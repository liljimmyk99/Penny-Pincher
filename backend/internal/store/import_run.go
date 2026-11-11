package store

import (
	"context"
	"database/sql"
	"errors"

	sqlite3 "modernc.org/sqlite/lib"
)

var (
	// ErrImportInProgress: the user already has an import running.
	ErrImportInProgress = errors.New("an import is already running")
	// ErrImportWrongStatus: the import's status does not allow this action
	// (or it changed while the action ran).
	ErrImportWrongStatus = errors.New("import has the wrong status")
)

// RestartFailureReason is the failure_reason of an import that was running
// when the server stopped.
const RestartFailureReason = "The server restarted during the import. Nothing from this file was kept."

// ResolvedImportRow is a ready import row with its category or income source
// looked up, so it can be written.
type ResolvedImportRow struct {
	Sheet      string // SheetExpenses or SheetIncome
	Date       string // YYYY-MM-DD
	CategoryID int64  // expenses
	Merchant   string // expenses
	Amount     int64  // expenses, cents
	SourceID   int64  // income
	Gross      int64
	Taxable    int64
	Net        int64
	Note       *string
}

// Start moves an import from review to running. A user can have only one
// running import (ErrImportInProgress); any other status is
// ErrImportWrongStatus.
func (x Imports) Start(ctx context.Context, userID, id int64) (Import, error) {
	res, err := x.DB.ExecContext(ctx, `UPDATE imports SET status = 'running', rows_done = 0
		WHERE id = ? AND user_id = ? AND status = 'review'`, id, userID)
	if sqliteCode(err) == sqlite3.SQLITE_CONSTRAINT_UNIQUE {
		return Import{}, ErrImportInProgress
	}
	if err != nil {
		return Import{}, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return Import{}, err
	}
	if n == 0 {
		if _, err := getImport(ctx, x.DB, userID, id); err != nil {
			return Import{}, err
		}
		return Import{}, ErrImportWrongStatus
	}
	return getImport(ctx, x.DB, userID, id)
}

// WriteBatch adds the rows as confirmed entries tagged with the import's id
// and advances rows_done, all in one transaction. It fails with
// ErrImportWrongStatus, writing nothing, when the import is no longer running.
func (x Imports) WriteBatch(ctx context.Context, userID, id int64, rows []ResolvedImportRow) error {
	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, `UPDATE imports SET rows_done = rows_done + ?
		WHERE id = ? AND user_id = ? AND status = 'running'`, len(rows), id, userID)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err != nil {
		return err
	} else if n == 0 {
		return ErrImportWrongStatus
	}
	for _, r := range rows {
		note, err := cleanNote(r.Note)
		if err != nil {
			return err
		}
		if r.Sheet == SheetIncome {
			_, err = tx.ExecContext(ctx, `INSERT INTO income_entries
				(user_id, income_source_id, received_on, gross_cents, gross_taxable_cents, net_cents,
				 note, confirmed, import_id) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
				userID, r.SourceID, r.Date, r.Gross, r.Taxable, r.Net, note, id)
		} else {
			var name string
			if name, err = cleanMerchantName(r.Merchant, "merchant"); err != nil {
				return err
			}
			var mer Merchant
			if mer, err = resolveMerchant(ctx, tx, userID, name); err != nil {
				return err
			}
			_, err = tx.ExecContext(ctx, `INSERT INTO expenses
				(user_id, category_id, merchant_id, occurred_on, amount_cents, note, confirmed, import_id)
				VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
				userID, r.CategoryID, mer.ID, r.Date, r.Amount, note, id)
		}
		if err != nil {
			return mapConstraint(err)
		}
	}
	return tx.Commit()
}

// Complete marks a running import completed.
func (x Imports) Complete(ctx context.Context, userID, id int64) (Import, error) {
	res, err := x.DB.ExecContext(ctx, `UPDATE imports SET status = 'completed', finished_at = `+nowSQL+`
		WHERE id = ? AND user_id = ? AND status = 'running'`, id, userID)
	if err != nil {
		return Import{}, err
	}
	if n, err := res.RowsAffected(); err != nil {
		return Import{}, err
	} else if n == 0 {
		return Import{}, ErrImportWrongStatus
	}
	return getImport(ctx, x.DB, userID, id)
}

// Rollback deletes every entry the import added (edited ones too; refunds
// linked to them are unlinked) and sets the import's status to `to`, in one
// transaction. It requires the import to be in status `from`, else
// ErrImportWrongStatus. reason is stored only for ImportFailed.
func (x Imports) Rollback(ctx context.Context, userID, id int64, from, to string, reason *string) (Import, error) {
	tx, err := x.DB.BeginTx(ctx, nil)
	if err != nil {
		return Import{}, err
	}
	defer tx.Rollback()
	imp, err := rollbackTx(ctx, tx, userID, id, from, to, reason)
	if err != nil {
		return Import{}, err
	}
	return imp, tx.Commit()
}

func rollbackTx(ctx context.Context, tx *sql.Tx, userID, id int64, from, to string, reason *string) (Import, error) {
	if to != ImportFailed {
		reason = nil
	}
	res, err := tx.ExecContext(ctx, `UPDATE imports SET status = ?, rows_done = 0, failure_reason = ?,
		finished_at = `+nowSQL+` WHERE id = ? AND user_id = ? AND status = ?`, to, reason, id, userID, from)
	if err != nil {
		return Import{}, err
	}
	if n, err := res.RowsAffected(); err != nil {
		return Import{}, err
	} else if n == 0 {
		if _, err := getImport(ctx, tx, userID, id); err != nil {
			return Import{}, err
		}
		return Import{}, ErrImportWrongStatus
	}
	if _, err := deleteImportEntries(ctx, tx, userID, id); err != nil {
		return Import{}, err
	}
	return getImport(ctx, tx, userID, id)
}

// RecoverRunning is for start-up: every import still marked running belongs to
// a process that is gone, so it becomes failed and its entries are deleted.
// It returns how many it recovered.
func (x Imports) RecoverRunning(ctx context.Context) (int, error) {
	rows, err := x.DB.QueryContext(ctx, `SELECT id, user_id FROM imports WHERE status = 'running'`)
	if err != nil {
		return 0, err
	}
	type ref struct{ id, user int64 }
	var refs []ref
	for rows.Next() {
		var r ref
		if err := rows.Scan(&r.id, &r.user); err != nil {
			rows.Close()
			return 0, err
		}
		refs = append(refs, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	reason := RestartFailureReason
	for i, r := range refs {
		if _, err := x.Rollback(ctx, r.user, r.id, ImportRunning, ImportFailed, &reason); err != nil {
			return i, err
		}
	}
	return len(refs), nil
}

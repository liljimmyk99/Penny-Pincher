package store

import (
	"context"
	"database/sql"
)

// Export reads a user's expenses and income entries for download. Rows are
// streamed to a callback, in date order, so a large history is never held in
// memory.
type Export struct{ DB *sql.DB }

// ExportRange limits an export to inclusive dates (YYYY-MM-DD). Empty means open.
type ExportRange struct{ From, To string }

func (r ExportRange) validate() error {
	if r.From != "" && r.To != "" && r.From > r.To {
		return invalid("to", "must not be before from")
	}
	return nil
}

// ExportExpense is one expense row with its category and merchant names.
type ExportExpense struct {
	ID                int64
	Date              string
	Category          string
	Merchant          string
	AmountCents       int64
	Type              string // "expense" | "refund"
	Note              string
	RefundedExpenseID *int64
	Confirmed         bool
}

// ExportIncome is one income entry with its source name.
type ExportIncome struct {
	ID                int64
	Date              string
	Source            string
	GrossCents        int64
	GrossTaxableCents int64
	NetCents          int64
	Note              string
	Confirmed         bool
}

// Expenses calls fn for each of the user's expenses and refunds in range.
func (e Export) Expenses(ctx context.Context, userID int64, r ExportRange, fn func(ExportExpense) error) error {
	if err := r.validate(); err != nil {
		return err
	}
	rows, err := e.DB.QueryContext(ctx, `
		SELECT x.id, x.occurred_on, c.name, m.name, x.amount_cents, x.type,
		       COALESCE(x.note, ''), x.refunded_expense_id, x.confirmed
		FROM expenses x
		JOIN categories c ON c.id = x.category_id AND c.user_id = x.user_id
		JOIN merchants  m ON m.id = x.merchant_id AND m.user_id = x.user_id
		WHERE x.user_id = ?1
		  AND (?2 = '' OR x.occurred_on >= ?2)
		  AND (?3 = '' OR x.occurred_on <= ?3)
		ORDER BY x.occurred_on, x.id`, userID, r.From, r.To)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var x ExportExpense
		var ref sql.NullInt64
		var conf int
		if err := rows.Scan(&x.ID, &x.Date, &x.Category, &x.Merchant, &x.AmountCents, &x.Type, &x.Note, &ref, &conf); err != nil {
			return err
		}
		if ref.Valid {
			x.RefundedExpenseID = &ref.Int64
		}
		x.Confirmed = conf == 1
		if err := fn(x); err != nil {
			return err
		}
	}
	return rows.Err()
}

// Income calls fn for each of the user's income entries in range.
func (e Export) Income(ctx context.Context, userID int64, r ExportRange, fn func(ExportIncome) error) error {
	if err := r.validate(); err != nil {
		return err
	}
	rows, err := e.DB.QueryContext(ctx, `
		SELECT i.id, i.received_on, s.name, i.gross_cents, i.gross_taxable_cents,
		       i.net_cents, COALESCE(i.note, ''), i.confirmed
		FROM income_entries i
		JOIN income_sources s ON s.id = i.income_source_id AND s.user_id = i.user_id
		WHERE i.user_id = ?1
		  AND (?2 = '' OR i.received_on >= ?2)
		  AND (?3 = '' OR i.received_on <= ?3)
		ORDER BY i.received_on, i.id`, userID, r.From, r.To)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var x ExportIncome
		var conf int
		if err := rows.Scan(&x.ID, &x.Date, &x.Source, &x.GrossCents, &x.GrossTaxableCents, &x.NetCents, &x.Note, &conf); err != nil {
			return err
		}
		x.Confirmed = conf == 1
		if err := fn(x); err != nil {
			return err
		}
	}
	return rows.Err()
}

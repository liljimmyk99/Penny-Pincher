package store

import (
	"context"
	"fmt"
)

// CategoryStat is a category's usage for the Categories & sources screen.
type CategoryStat struct {
	CategoryID     int64
	EntryCount     int   // expenses and refunds, all time
	TotalCents     int64 // all time, net of refunds
	YearTotalCents int64 // dated in the requested year, net of refunds
}

// IncomeSourceStat is an income source's usage for the Categories & sources
// screen.
type IncomeSourceStat struct {
	IncomeSourceID        int64
	EntryCount            int // all time
	YearGrossCents        int64
	YearGrossTaxableCents int64
	YearNetCents          int64
}

// checkYear enforces the spec's Year range.
func checkYear(year int) error {
	if year < 2000 || year > 2100 {
		return invalid("year", "must be between 2000 and 2100")
	}
	return nil
}

func yearPrefix(year int) string { return fmt.Sprintf("%04d-", year) }

// Stats returns one row per category (zero-filled, in sort order) with its
// all-time entry count and total, and its total for year.
func (c Categories) Stats(ctx context.Context, userID int64, year int) ([]CategoryStat, error) {
	if err := checkYear(year); err != nil {
		return nil, err
	}
	rows, err := c.DB.QueryContext(ctx, `
		SELECT c.id,
		       COUNT(e.id),
		       COALESCE(SUM(e.amount_cents), 0),
		       COALESCE(SUM(CASE WHEN substr(e.occurred_on, 1, 5) = ? THEN e.amount_cents END), 0)
		  FROM categories c
		  LEFT JOIN expenses e ON e.user_id = c.user_id AND e.category_id = c.id
		 WHERE c.user_id = ?
		 GROUP BY c.id
		 ORDER BY c.sort_order, c.id`, yearPrefix(year), userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CategoryStat{}
	for rows.Next() {
		var s CategoryStat
		if err := rows.Scan(&s.CategoryID, &s.EntryCount, &s.TotalCents, &s.YearTotalCents); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// Stats returns one row per income source (zero-filled, in sort order) with
// its all-time entry count and its gross, gross taxable and net for year.
func (s IncomeSources) Stats(ctx context.Context, userID int64, year int) ([]IncomeSourceStat, error) {
	if err := checkYear(year); err != nil {
		return nil, err
	}
	rows, err := s.DB.QueryContext(ctx, `
		SELECT s.id,
		       COUNT(i.id),
		       COALESCE(SUM(CASE WHEN substr(i.received_on, 1, 5) = ?1 THEN i.gross_cents END), 0),
		       COALESCE(SUM(CASE WHEN substr(i.received_on, 1, 5) = ?1 THEN i.gross_taxable_cents END), 0),
		       COALESCE(SUM(CASE WHEN substr(i.received_on, 1, 5) = ?1 THEN i.net_cents END), 0)
		  FROM income_sources s
		  LEFT JOIN income_entries i ON i.user_id = s.user_id AND i.income_source_id = s.id
		 WHERE s.user_id = ?2
		 GROUP BY s.id
		 ORDER BY s.sort_order, s.id`, yearPrefix(year), userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []IncomeSourceStat{}
	for rows.Next() {
		var st IncomeSourceStat
		if err := rows.Scan(&st.IncomeSourceID, &st.EntryCount, &st.YearGrossCents,
			&st.YearGrossTaxableCents, &st.YearNetCents); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

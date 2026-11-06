package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// IncomeTotals are summed income figures.
type IncomeTotals struct {
	GrossCents        int64
	GrossTaxableCents int64
	NetCents          int64
	EntryCount        int
}

// SourceMonth is an income source's totals for one month.
type SourceMonth struct {
	IncomeSourceID int64
	Name           string
	IsProtected    bool
	IncomeTotals
}

// CategoryMonth is a category's spending for one month and the month before.
type CategoryMonth struct {
	CategoryID         int64
	Name               string
	Color              *string
	IsSaving           bool
	IsProtected        bool
	TotalCents         int64 // net of refunds logged in the month
	ExpenseCount       int
	RefundCount        int
	PreviousTotalCents int64
}

// MonthlySummary is the landing view's data. Template applies are read
// separately with Months.ListApplies.
type MonthlySummary struct {
	Month                       string
	Sources                     []SourceMonth
	Combined                    IncomeTotals
	Categories                  []CategoryMonth
	SpentCents                  int64
	SavingCents                 int64
	PreviousMonthSpentCents     int64
	LeftOverCents               int64
	UnconfirmedExpenseCount     int
	UnconfirmedIncomeEntryCount int
	IsEmpty                     bool
}

// MonthTotals is one month of the yearly table.
type MonthTotals struct {
	Month             string
	GrossCents        int64
	GrossTaxableCents int64
	NetCents          int64
	SpentCents        int64
	SavingCents       int64
	LeftOverCents     int64
	HasEntries        bool
}

// CategoryYear is a category's totals for a year.
type CategoryYear struct {
	CategoryID          int64
	Name                string
	Color               *string
	IsSaving            bool
	IsProtected         bool
	TotalCents          int64
	MonthlyAverageCents int64
}

// YearlySummary is the yearly view's data.
type YearlySummary struct {
	Year              int
	Months            []MonthTotals // January to December
	Categories        []CategoryYear
	Totals            MonthTotals // Month is empty
	AverageMonthCount int
}

// Summaries computes monthly and yearly totals in SQL from the v_monthly_*
// views. Every method is scoped to the given user.
type Summaries struct{ DB *sql.DB }

// Monthly returns the summary for month (YYYY-MM): every income source and
// category zero-filled in sort order, with the previous month's category
// totals for comparison. Refunds count in the month of their own date.
func (s Summaries) Monthly(ctx context.Context, userID int64, month string) (MonthlySummary, error) {
	from, to, _, err := monthBounds(month)
	if err != nil {
		return MonthlySummary{}, err
	}
	t, _ := time.Parse("2006-01", month)
	prev := t.AddDate(0, -1, 0).Format("2006-01") // January compares with the previous December

	out := MonthlySummary{Month: month, Sources: []SourceMonth{}, Categories: []CategoryMonth{}}

	rows, err := s.DB.QueryContext(ctx, `
		SELECT s.id, s.name, s.is_protected,
		       COALESCE(v.gross_cents, 0), COALESCE(v.gross_taxable_cents, 0),
		       COALESCE(v.net_cents, 0), COALESCE(v.entry_count, 0)
		  FROM income_sources s
		  LEFT JOIN v_monthly_income_by_source v
		    ON v.user_id = s.user_id AND v.income_source_id = s.id AND v.year_month = ?
		 WHERE s.user_id = ?
		 ORDER BY s.sort_order, s.id`, month, userID)
	if err != nil {
		return MonthlySummary{}, err
	}
	for rows.Next() {
		var r SourceMonth
		if err := rows.Scan(&r.IncomeSourceID, &r.Name, &r.IsProtected,
			&r.GrossCents, &r.GrossTaxableCents, &r.NetCents, &r.EntryCount); err != nil {
			rows.Close()
			return MonthlySummary{}, err
		}
		out.Sources = append(out.Sources, r)
	}
	if err := closeRows(rows); err != nil {
		return MonthlySummary{}, err
	}

	rows, err = s.DB.QueryContext(ctx, `
		SELECT c.id, c.name, c.color, c.is_saving, c.is_protected,
		       COALESCE(cur.total_cents, 0), COALESCE(cur.expense_count, 0), COALESCE(cur.refund_count, 0),
		       COALESCE(prv.total_cents, 0)
		  FROM categories c
		  LEFT JOIN v_monthly_category_spend cur
		    ON cur.user_id = c.user_id AND cur.category_id = c.id AND cur.year_month = ?1
		  LEFT JOIN v_monthly_category_spend prv
		    ON prv.user_id = c.user_id AND prv.category_id = c.id AND prv.year_month = ?2
		 WHERE c.user_id = ?3
		 ORDER BY c.sort_order, c.id`, month, prev, userID)
	if err != nil {
		return MonthlySummary{}, err
	}
	for rows.Next() {
		var r CategoryMonth
		if err := rows.Scan(&r.CategoryID, &r.Name, &r.Color, &r.IsSaving, &r.IsProtected,
			&r.TotalCents, &r.ExpenseCount, &r.RefundCount, &r.PreviousTotalCents); err != nil {
			rows.Close()
			return MonthlySummary{}, err
		}
		out.Categories = append(out.Categories, r)
	}
	if err := closeRows(rows); err != nil {
		return MonthlySummary{}, err
	}

	// Totals for this and the previous month; either row may be absent.
	rows, err = s.DB.QueryContext(ctx, `
		SELECT year_month, gross_cents, gross_taxable_cents, net_cents, spent_cents, saving_cents
		  FROM v_monthly_totals
		 WHERE user_id = ? AND year_month IN (?, ?)`, userID, month, prev)
	if err != nil {
		return MonthlySummary{}, err
	}
	for rows.Next() {
		var ym string
		var gross, taxable, net, spent, saving int64
		if err := rows.Scan(&ym, &gross, &taxable, &net, &spent, &saving); err != nil {
			rows.Close()
			return MonthlySummary{}, err
		}
		if ym == month {
			out.Combined.GrossCents, out.Combined.GrossTaxableCents, out.Combined.NetCents = gross, taxable, net
			out.SpentCents, out.SavingCents = spent, saving
		} else {
			out.PreviousMonthSpentCents = spent
		}
	}
	if err := closeRows(rows); err != nil {
		return MonthlySummary{}, err
	}
	for _, src := range out.Sources {
		out.Combined.EntryCount += src.EntryCount
	}
	out.LeftOverCents = out.Combined.NetCents - out.SpentCents

	var expenseEntries int
	if err := s.DB.QueryRowContext(ctx, `
		SELECT (SELECT count(*) FROM expenses WHERE user_id = ?1 AND occurred_on BETWEEN ?2 AND ?3),
		       (SELECT count(*) FROM expenses WHERE user_id = ?1 AND occurred_on BETWEEN ?2 AND ?3 AND confirmed = 0),
		       (SELECT count(*) FROM income_entries WHERE user_id = ?1 AND received_on BETWEEN ?2 AND ?3 AND confirmed = 0)`,
		userID, from, to).Scan(&expenseEntries, &out.UnconfirmedExpenseCount, &out.UnconfirmedIncomeEntryCount); err != nil {
		return MonthlySummary{}, err
	}
	out.IsEmpty = expenseEntries == 0 && out.Combined.EntryCount == 0
	return out, nil
}

// Yearly returns the summary for year: all twelve months zero-filled,
// category totals, and monthly averages. Averages divide by the number of
// months that have any entries, so a year in progress is not pulled down.
func (s Summaries) Yearly(ctx context.Context, userID int64, year int) (YearlySummary, error) {
	if err := checkYear(year); err != nil {
		return YearlySummary{}, err
	}
	out := YearlySummary{Year: year, Months: make([]MonthTotals, 12), Categories: []CategoryYear{}}
	for i := range out.Months {
		out.Months[i].Month = fmt.Sprintf("%04d-%02d", year, i+1)
	}

	rows, err := s.DB.QueryContext(ctx, `
		SELECT CAST(substr(year_month, 6, 2) AS INTEGER),
		       gross_cents, gross_taxable_cents, net_cents, spent_cents, saving_cents
		  FROM v_monthly_totals
		 WHERE user_id = ? AND substr(year_month, 1, 5) = ?`, userID, yearPrefix(year))
	if err != nil {
		return YearlySummary{}, err
	}
	for rows.Next() {
		var m int
		var r MonthTotals
		if err := rows.Scan(&m, &r.GrossCents, &r.GrossTaxableCents, &r.NetCents, &r.SpentCents, &r.SavingCents); err != nil {
			rows.Close()
			return YearlySummary{}, err
		}
		r.Month, r.HasEntries = out.Months[m-1].Month, true
		r.LeftOverCents = r.NetCents - r.SpentCents
		out.Months[m-1] = r
	}
	if err := closeRows(rows); err != nil {
		return YearlySummary{}, err
	}
	for _, m := range out.Months {
		if m.HasEntries {
			out.AverageMonthCount++
		}
		out.Totals.GrossCents += m.GrossCents
		out.Totals.GrossTaxableCents += m.GrossTaxableCents
		out.Totals.NetCents += m.NetCents
		out.Totals.SpentCents += m.SpentCents
		out.Totals.SavingCents += m.SavingCents
	}
	out.Totals.LeftOverCents = out.Totals.NetCents - out.Totals.SpentCents

	rows, err = s.DB.QueryContext(ctx, `
		SELECT c.id, c.name, c.color, c.is_saving, c.is_protected,
		       COALESCE(SUM(v.total_cents), 0)
		  FROM categories c
		  LEFT JOIN v_monthly_category_spend v
		    ON v.user_id = c.user_id AND v.category_id = c.id AND substr(v.year_month, 1, 5) = ?
		 WHERE c.user_id = ?
		 GROUP BY c.id
		 ORDER BY c.sort_order, c.id`, yearPrefix(year), userID)
	if err != nil {
		return YearlySummary{}, err
	}
	for rows.Next() {
		var r CategoryYear
		if err := rows.Scan(&r.CategoryID, &r.Name, &r.Color, &r.IsSaving, &r.IsProtected, &r.TotalCents); err != nil {
			rows.Close()
			return YearlySummary{}, err
		}
		r.MonthlyAverageCents = divRound(r.TotalCents, int64(out.AverageMonthCount))
		out.Categories = append(out.Categories, r)
	}
	if err := closeRows(rows); err != nil {
		return YearlySummary{}, err
	}
	return out, nil
}

// divRound is n/d rounded half away from zero; 0 when d is 0.
func divRound(n, d int64) int64 {
	if d == 0 {
		return 0
	}
	if n < 0 {
		return -((-n*2 + d) / (2 * d))
	}
	return (n*2 + d) / (2 * d)
}

func closeRows(rows *sql.Rows) error {
	err := rows.Err()
	if cerr := rows.Close(); err == nil {
		err = cerr
	}
	return err
}

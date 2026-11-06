package store

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Trend group-by values and the saved-trend vocabularies.
const (
	GroupByMonth = "month"
	GroupByYear  = "year"

	MatchMerchant = "merchant"
	MatchCategory = "category"
	MatchNote     = "note"

	MeasureAmount = "amount"
	MeasureCount  = "count"
)

// maxTrendBuckets bounds how many periods one query may return.
const maxTrendBuckets = 1200

const maxMatchTextLen = 200

// TrendFilter selects expenses for a custom trend. Filters combine with AND;
// at least one of CategoryID, MerchantID and Text is required.
type TrendFilter struct {
	CategoryID *int64
	MerchantID *int64
	Text       string // case-insensitive substring of the note
	From, To   string // inclusive YYYY-MM-DD
	GroupBy    string // "month" (default) or "year"
}

// TrendBucket is one period of a custom trend.
type TrendBucket struct {
	Period     string // YYYY-MM or YYYY
	TotalCents int64  // net of refunds
	Count      int    // expenses only; refunds are not transactions
}

// Trend is a custom trend: every period in the range, zero-filled.
type Trend struct {
	GroupBy string
	Buckets []TrendBucket
}

// Trends computes custom trends in SQL. Every method is scoped to the user.
type Trends struct{ DB *sql.DB }

// Custom returns the trend for the filter. Refunds are netted into the period
// of their own date.
func (t Trends) Custom(ctx context.Context, userID int64, f TrendFilter) (Trend, error) {
	if f.GroupBy == "" {
		f.GroupBy = GroupByMonth
	}
	if f.GroupBy != GroupByMonth && f.GroupBy != GroupByYear {
		return Trend{}, invalid("group_by", "must be month or year")
	}
	f.Text = strings.TrimSpace(f.Text)
	if f.CategoryID == nil && f.MerchantID == nil && f.Text == "" {
		return Trend{}, invalid("filter", "needs at least one of category_id, merchant_id, text")
	}
	if utf8.RuneCountInString(f.Text) > maxMatchTextLen {
		return Trend{}, invalid("text", "must be at most 200 characters")
	}
	if err := checkDate(f.From, "from"); err != nil {
		return Trend{}, err
	}
	if err := checkDate(f.To, "to"); err != nil {
		return Trend{}, err
	}
	if f.From > f.To {
		return Trend{}, invalid("from", "must not be after to")
	}
	periods := trendPeriods(f.From, f.To, f.GroupBy)
	if len(periods) > maxTrendBuckets {
		return Trend{}, invalid("to", "range is too long")
	}

	width := 7
	if f.GroupBy == GroupByYear {
		width = 4
	}
	q := `SELECT substr(occurred_on, 1, ?) AS period,
	             SUM(amount_cents),
	             SUM(CASE WHEN amount_cents > 0 THEN 1 ELSE 0 END)
	        FROM expenses
	       WHERE user_id = ? AND occurred_on BETWEEN ? AND ?`
	args := []any{width, userID, f.From, f.To}
	if f.CategoryID != nil {
		q += ` AND category_id = ?`
		args = append(args, *f.CategoryID)
	}
	if f.MerchantID != nil {
		q += ` AND merchant_id = ?`
		args = append(args, *f.MerchantID)
	}
	if f.Text != "" {
		q += ` AND instr(lower(COALESCE(note, '')), lower(?)) > 0`
		args = append(args, f.Text)
	}
	q += ` GROUP BY period`

	rows, err := t.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return Trend{}, err
	}
	defer rows.Close()
	found := map[string]TrendBucket{}
	for rows.Next() {
		var b TrendBucket
		if err := rows.Scan(&b.Period, &b.TotalCents, &b.Count); err != nil {
			return Trend{}, err
		}
		found[b.Period] = b
	}
	if err := rows.Err(); err != nil {
		return Trend{}, err
	}

	out := Trend{GroupBy: f.GroupBy, Buckets: make([]TrendBucket, len(periods))}
	for i, p := range periods {
		out.Buckets[i] = TrendBucket{Period: p}
		if b, ok := found[p]; ok {
			out.Buckets[i] = b
		}
	}
	return out, nil
}

// trendPeriods lists every period from the one containing from to the one
// containing to, oldest first. Both dates are already validated.
func trendPeriods(from, to, groupBy string) []string {
	if groupBy == GroupByYear {
		a, _ := strconv.Atoi(from[:4])
		b, _ := strconv.Atoi(to[:4])
		out := make([]string, 0, b-a+1)
		for y := a; y <= b; y++ {
			out = append(out, strconv.Itoa(y))
		}
		return out
	}
	cur, _ := time.Parse("2006-01", from[:7])
	end, _ := time.Parse("2006-01", to[:7])
	var out []string
	for !cur.After(end) {
		out = append(out, cur.Format("2006-01"))
		cur = cur.AddDate(0, 1, 0)
	}
	return out
}

// SavedTrend is a saved custom-trend definition. Exactly one of MerchantID,
// CategoryID and MatchText is set, matching MatchType.
type SavedTrend struct {
	ID         int64
	Name       string
	MatchType  string
	MerchantID *int64
	CategoryID *int64
	MatchText  *string
	Measure    string
	SortOrder  int
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// NewSavedTrend is the input for Create.
type NewSavedTrend struct {
	Name       string
	MatchType  string
	MerchantID *int64
	CategoryID *int64
	MatchText  *string
	Measure    string
	SortOrder  *int // nil appends to the end
}

// SavedTrendPatch is a partial update. Nil fields are unchanged; the Set*
// flags mark match fields that were sent (a nil value then clears them).
type SavedTrendPatch struct {
	Name                              *string
	MatchType                         *string
	SetMerchant, SetCategory, SetText bool
	MerchantID, CategoryID            *int64
	MatchText                         *string
	Measure                           *string
	SortOrder                         *int
}

// SavedTrends reads and writes the saved_trends table, scoped to the user.
type SavedTrends struct{ DB *sql.DB }

const savedTrendCols = `id, name, match_type, merchant_id, category_id, match_text, measure, sort_order, created_at, updated_at`

// List returns the user's saved trends in sort order.
func (s SavedTrends) List(ctx context.Context, userID int64) ([]SavedTrend, error) {
	rows, err := s.DB.QueryContext(ctx,
		`SELECT `+savedTrendCols+` FROM saved_trends WHERE user_id = ? ORDER BY sort_order, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SavedTrend{}
	for rows.Next() {
		st, err := scanSavedTrend(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

// Get returns one saved trend, or ErrNotFound.
func (s SavedTrends) Get(ctx context.Context, userID, id int64) (SavedTrend, error) {
	return getSavedTrend(ctx, s.DB, userID, id)
}

// Create saves a trend.
func (s SavedTrends) Create(ctx context.Context, userID int64, in NewSavedTrend) (SavedTrend, error) {
	name, err := cleanName(in.Name)
	if err != nil {
		return SavedTrend{}, err
	}
	st := SavedTrend{
		Name: name, MatchType: in.MatchType, MerchantID: in.MerchantID,
		CategoryID: in.CategoryID, MatchText: in.MatchText, Measure: in.Measure,
	}
	if err := normalizeSavedTrend(&st); err != nil {
		return SavedTrend{}, err
	}

	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return SavedTrend{}, err
	}
	defer tx.Rollback()

	if err := checkSavedTrendRefs(ctx, tx, userID, st); err != nil {
		return SavedTrend{}, err
	}
	if err := checkNameFree(ctx, tx, "saved_trends", userID, st.Name, 0); err != nil {
		return SavedTrend{}, err
	}
	if in.SortOrder != nil {
		st.SortOrder = *in.SortOrder
	} else if err := tx.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(sort_order), 0) + ? FROM saved_trends WHERE user_id = ?`, sortStep, userID).
		Scan(&st.SortOrder); err != nil {
		return SavedTrend{}, err
	}
	res, err := tx.ExecContext(ctx,
		`INSERT INTO saved_trends (user_id, name, match_type, merchant_id, category_id, match_text, measure, sort_order)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		userID, st.Name, st.MatchType, st.MerchantID, st.CategoryID, st.MatchText, st.Measure, st.SortOrder)
	if err != nil {
		return SavedTrend{}, mapConstraint(err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return SavedTrend{}, err
	}
	out, err := getSavedTrend(ctx, tx, userID, id)
	if err != nil {
		return SavedTrend{}, err
	}
	return out, tx.Commit()
}

// Update applies a partial update. Changing the match type requires the
// matching field for the new type; the other match fields are cleared.
func (s SavedTrends) Update(ctx context.Context, userID, id int64, p SavedTrendPatch) (SavedTrend, error) {
	if p.Name == nil && p.MatchType == nil && !p.SetMerchant && !p.SetCategory && !p.SetText &&
		p.Measure == nil && p.SortOrder == nil {
		return SavedTrend{}, invalid("body", "must set at least one field")
	}

	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return SavedTrend{}, err
	}
	defer tx.Rollback()

	st, err := getSavedTrend(ctx, tx, userID, id)
	if err != nil {
		return SavedTrend{}, err
	}
	if p.Name != nil {
		if st.Name, err = cleanName(*p.Name); err != nil {
			return SavedTrend{}, err
		}
	}
	if p.Measure != nil {
		st.Measure = *p.Measure
	}
	if p.SortOrder != nil {
		st.SortOrder = *p.SortOrder
	}
	if p.MatchType != nil && *p.MatchType != st.MatchType {
		need := map[string]bool{MatchMerchant: p.SetMerchant, MatchCategory: p.SetCategory, MatchNote: p.SetText}
		if known, ok := need[*p.MatchType]; ok && !known {
			return SavedTrend{}, invalid("match_type", "changing it requires the matching field for the new type")
		}
		st.MatchType = *p.MatchType
		st.MerchantID, st.CategoryID, st.MatchText = nil, nil, nil
	}
	if p.SetMerchant {
		st.MerchantID = p.MerchantID
	}
	if p.SetCategory {
		st.CategoryID = p.CategoryID
	}
	if p.SetText {
		st.MatchText = p.MatchText
	}
	if err := normalizeSavedTrend(&st); err != nil {
		return SavedTrend{}, err
	}
	if err := checkSavedTrendRefs(ctx, tx, userID, st); err != nil {
		return SavedTrend{}, err
	}
	if p.Name != nil {
		if err := checkNameFree(ctx, tx, "saved_trends", userID, st.Name, id); err != nil {
			return SavedTrend{}, err
		}
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE saved_trends SET name = ?, match_type = ?, merchant_id = ?, category_id = ?, match_text = ?,
		        measure = ?, sort_order = ?, updated_at = `+nowSQL+`
		  WHERE id = ? AND user_id = ?`,
		st.Name, st.MatchType, st.MerchantID, st.CategoryID, st.MatchText, st.Measure, st.SortOrder,
		id, userID); err != nil {
		return SavedTrend{}, mapConstraint(err)
	}
	out, err := getSavedTrend(ctx, tx, userID, id)
	if err != nil {
		return SavedTrend{}, err
	}
	return out, tx.Commit()
}

// Delete removes a saved trend, or returns ErrNotFound.
func (s SavedTrends) Delete(ctx context.Context, userID, id int64) error {
	res, err := s.DB.ExecContext(ctx, `DELETE FROM saved_trends WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err != nil {
		return err
	} else if n == 0 {
		return ErrNotFound
	}
	return nil
}

// normalizeSavedTrend validates the vocabularies and requires exactly the
// match field that goes with MatchType.
func normalizeSavedTrend(st *SavedTrend) error {
	if st.Measure != MeasureAmount && st.Measure != MeasureCount {
		return invalid("measure", "must be amount or count")
	}
	if st.MatchText != nil {
		t := strings.TrimSpace(*st.MatchText)
		if utf8.RuneCountInString(t) > maxMatchTextLen {
			return invalid("match_text", "must be at most 200 characters")
		}
		st.MatchText = &t
	}
	var field string
	var set bool
	switch st.MatchType {
	case MatchMerchant:
		field, set = "merchant_id", st.MerchantID != nil
	case MatchCategory:
		field, set = "category_id", st.CategoryID != nil
	case MatchNote:
		field, set = "match_text", st.MatchText != nil && *st.MatchText != ""
	default:
		return invalid("match_type", "must be merchant, category or note")
	}
	if !set {
		return invalid(field, "is required for this match_type")
	}
	if (st.MatchType != MatchMerchant && st.MerchantID != nil) ||
		(st.MatchType != MatchCategory && st.CategoryID != nil) ||
		(st.MatchType != MatchNote && st.MatchText != nil) {
		return invalid("match_type", "send only the field that matches it")
	}
	return nil
}

func checkSavedTrendRefs(ctx context.Context, q querier, userID int64, st SavedTrend) error {
	switch {
	case st.MerchantID != nil:
		var ok bool
		if err := q.QueryRowContext(ctx,
			`SELECT EXISTS (SELECT 1 FROM merchants WHERE id = ? AND user_id = ?)`, *st.MerchantID, userID).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return invalid("merchant_id", "must be one of your merchants")
		}
	case st.CategoryID != nil:
		return checkCategory(ctx, q, userID, *st.CategoryID)
	}
	return nil
}

func getSavedTrend(ctx context.Context, q querier, userID, id int64) (SavedTrend, error) {
	st, err := scanSavedTrend(q.QueryRowContext(ctx,
		`SELECT `+savedTrendCols+` FROM saved_trends WHERE id = ? AND user_id = ?`, id, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return SavedTrend{}, ErrNotFound
	}
	return st, err
}

func scanSavedTrend(r interface{ Scan(...any) error }) (SavedTrend, error) {
	var st SavedTrend
	var created, updated string
	if err := r.Scan(&st.ID, &st.Name, &st.MatchType, &st.MerchantID, &st.CategoryID, &st.MatchText,
		&st.Measure, &st.SortOrder, &created, &updated); err != nil {
		return SavedTrend{}, err
	}
	var err error
	if st.CreatedAt, err = parseTS(created); err != nil {
		return SavedTrend{}, err
	}
	if st.UpdatedAt, err = parseTS(updated); err != nil {
		return SavedTrend{}, err
	}
	return st, nil
}

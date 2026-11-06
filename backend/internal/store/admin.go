package store

import (
	"context"
	"database/sql"
	"time"
)

// DBInfo is database-level information for the admin status tile. It holds no
// user data.
type DBInfo struct {
	SizeBytes int64
	// LastWrite is the latest updated_at across user data, nil when empty.
	LastWrite *time.Time
}

// Admin reads database-level facts. It is not scoped to a user because it
// returns only a size and a timestamp, never rows.
type Admin struct{ DB *sql.DB }

// Info returns the database size (pages x page size) and last write time.
func (a Admin) Info(ctx context.Context) (DBInfo, error) {
	var info DBInfo
	if err := a.DB.QueryRowContext(ctx,
		`SELECT (SELECT page_count FROM pragma_page_count) * (SELECT page_size FROM pragma_page_size)`).
		Scan(&info.SizeBytes); err != nil {
		return info, err
	}
	var last sql.NullString
	if err := a.DB.QueryRowContext(ctx, `
		SELECT MAX(m) FROM (
			SELECT MAX(updated_at) AS m FROM categories
			UNION ALL SELECT MAX(updated_at) FROM income_sources
			UNION ALL SELECT MAX(updated_at) FROM merchants
			UNION ALL SELECT MAX(updated_at) FROM templates
			UNION ALL SELECT MAX(updated_at) FROM expenses
			UNION ALL SELECT MAX(updated_at) FROM income_entries
			UNION ALL SELECT MAX(updated_at) FROM saved_trends
		)`).Scan(&last); err != nil {
		return info, err
	}
	if last.Valid {
		t, err := time.Parse(time.RFC3339Nano, last.String)
		if err != nil {
			return info, err
		}
		info.LastWrite = &t
	}
	return info, nil
}

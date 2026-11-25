package store

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"net/url"
	"sort"
	"strings"

	_ "modernc.org/sqlite" // pure-Go driver, registers "sqlite"

	"github.com/liljimmyk99/penny-pincher/backend/migrations"
)

// Open opens the SQLite database at path. Pragmas are set in the DSN so that
// every pooled connection gets them.
func Open(path string) (*sql.DB, error) {
	q := url.Values{}
	for _, p := range []string{"foreign_keys(1)", "busy_timeout(5000)", "synchronous(NORMAL)", "journal_mode(WAL)"} {
		q.Add("_pragma", p)
	}
	db, err := sql.Open("sqlite", "file:"+path+"?"+q.Encode())
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("open database: %w", err)
	}
	return db, nil
}

// Migrate applies every pending migration, each in its own transaction.
func Migrate(ctx context.Context, db *sql.DB) error {
	return migrate(ctx, db, migrations.FS)
}

func migrate(ctx context.Context, db *sql.DB, fsys fs.FS) error {
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version TEXT PRIMARY KEY,
		applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	) STRICT`); err != nil {
		return err
	}
	files, err := fs.Glob(fsys, "*.sql")
	if err != nil {
		return err
	}
	sort.Strings(files)
	for _, name := range files {
		version := strings.TrimSuffix(name, ".sql")
		var n int
		if err := db.QueryRowContext(ctx, `SELECT count(*) FROM schema_migrations WHERE version = ?`, version).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			continue
		}
		body, err := fs.ReadFile(fsys, name)
		if err != nil {
			return err
		}
		if err := applyOne(ctx, db, version, string(body)); err != nil {
			return fmt.Errorf("migration %s: %w", version, err)
		}
	}
	return nil
}

// rebuildMarker on a migration's first line asks for the table-rebuild recipe
// from the SQLite docs: foreign keys off (so DROP TABLE does not cascade),
// legacy_alter_table on (so RENAME does not rewrite triggers), and a
// foreign_key_check before commit. These pragmas are no-ops inside a
// transaction, so they are set on a dedicated connection first.
const rebuildMarker = "-- migrate: rebuild"

func applyOne(ctx context.Context, db *sql.DB, version, body string) error {
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	rebuild := strings.HasPrefix(body, rebuildMarker)
	if rebuild {
		if _, err := conn.ExecContext(ctx, `PRAGMA foreign_keys = OFF`); err != nil {
			return err
		}
		if _, err := conn.ExecContext(ctx, `PRAGMA legacy_alter_table = ON`); err != nil {
			return err
		}
		defer func() {
			// Restore the per-connection settings the DSN gave this pooled connection.
			conn.ExecContext(context.Background(), `PRAGMA legacy_alter_table = OFF`)
			conn.ExecContext(context.Background(), `PRAGMA foreign_keys = ON`)
		}()
	}

	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, body); err != nil {
		return err
	}
	if rebuild {
		rows, err := tx.QueryContext(ctx, `PRAGMA foreign_key_check`)
		if err != nil {
			return err
		}
		bad := rows.Next()
		rows.Close()
		if bad {
			return fmt.Errorf("foreign key check failed after rebuild")
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (version) VALUES (?)`, version); err != nil {
		return err
	}
	return tx.Commit()
}

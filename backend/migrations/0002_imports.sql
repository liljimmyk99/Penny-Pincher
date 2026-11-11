-- Excel import (AGENTS.md §6.14, §10): the import log, the rows the server
-- checked, their problems, and the import_id each imported entry carries so
-- the whole batch can be cancelled or undone.

-- -----------------------------------------------------------------------------
-- Imports. One row per uploaded Excel file.
--   review    checked, nothing saved yet (expires after 24 hours)
--   running -> completed | cancelled | failed ; completed -> undone
--   Counts are fixed when the file is checked. Progress and entries imported
--   are read from import_rows / the entry tables, never stored twice.
-- -----------------------------------------------------------------------------
CREATE TABLE imports (
    id                  INTEGER PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    file_name           TEXT    NOT NULL,
    status              TEXT    NOT NULL DEFAULT 'review'
                                CHECK (status IN ('review', 'running', 'completed', 'cancelled',
                                                  'failed', 'undone', 'expired')),
    expense_rows        INTEGER NOT NULL DEFAULT 0 CHECK (expense_rows >= 0),
    income_rows         INTEGER NOT NULL DEFAULT 0 CHECK (income_rows >= 0),
    rows_ready          INTEGER NOT NULL DEFAULT 0 CHECK (rows_ready >= 0),
    rows_with_problems  INTEGER NOT NULL DEFAULT 0 CHECK (rows_with_problems >= 0),
    rows_done           INTEGER NOT NULL DEFAULT 0 CHECK (rows_done >= 0),
    failure_reason      TEXT,
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    finished_at         TEXT,
    UNIQUE (id, user_id),                     -- target for composite FKs
    CHECK (rows_ready + rows_with_problems = expense_rows + income_rows),
    CHECK (failure_reason IS NULL OR status = 'failed')
) STRICT;

CREATE INDEX imports_user_created ON imports (user_id, created_at DESC);
CREATE INDEX imports_user_status  ON imports (user_id, status);
-- At most one running import per user.
CREATE UNIQUE INDEX imports_one_running_per_user ON imports (user_id) WHERE status = 'running';

-- -----------------------------------------------------------------------------
-- Checked rows. One per data row of either sheet, in sheet order.
--   row_number is the Excel row (row 1 is the header).
--   Ready rows hold parsed values (dollars already converted to integer
--   cents); category, merchant and source are kept as text and resolved when
--   the import runs. Rows with problems keep their original cells as a JSON
--   array of text so the problem rows can be downloaded.
-- -----------------------------------------------------------------------------
CREATE TABLE import_rows (
    id                   INTEGER PRIMARY KEY,
    import_id            INTEGER NOT NULL,
    user_id              INTEGER NOT NULL,
    sheet                TEXT    NOT NULL CHECK (sheet IN ('expenses', 'income')),
    row_number           INTEGER NOT NULL CHECK (row_number >= 2),
    ready                INTEGER NOT NULL CHECK (ready IN (0, 1)),
    occurred_on          TEXT    CHECK (occurred_on IS NULL OR date(occurred_on) IS occurred_on),
    category             TEXT,
    merchant             TEXT,
    source               TEXT,
    amount_cents         INTEGER,
    gross_cents          INTEGER,
    gross_taxable_cents  INTEGER,
    net_cents            INTEGER,
    note                 TEXT,
    original             TEXT,
    UNIQUE (import_id, sheet, row_number),
    FOREIGN KEY (import_id, user_id) REFERENCES imports (id, user_id) ON DELETE CASCADE,
    CHECK (ready = 0 OR occurred_on IS NOT NULL),
    CHECK (ready = 0 OR sheet <> 'expenses'
           OR (category IS NOT NULL AND merchant IS NOT NULL AND amount_cents IS NOT NULL AND amount_cents <> 0)),
    CHECK (ready = 0 OR sheet <> 'income'
           OR (source IS NOT NULL AND gross_cents IS NOT NULL
               AND gross_taxable_cents IS NOT NULL AND net_cents IS NOT NULL))
) STRICT;

CREATE INDEX import_rows_ready ON import_rows (import_id, ready, occurred_on);

-- -----------------------------------------------------------------------------
-- Row issues. A row may have several. `code` matches the OpenAPI enum.
-- -----------------------------------------------------------------------------
CREATE TABLE import_issues (
    id          INTEGER PRIMARY KEY,
    import_id   INTEGER NOT NULL,
    user_id     INTEGER NOT NULL,
    sheet       TEXT    NOT NULL CHECK (sheet IN ('expenses', 'income')),
    row_number  INTEGER NOT NULL CHECK (row_number >= 2),
    column_name TEXT    NOT NULL,
    code        TEXT    NOT NULL CHECK (code IN (
                    'unknown_category', 'unknown_income_source', 'invalid_date', 'missing_value',
                    'invalid_number', 'too_many_decimals', 'zero_amount', 'negative_income',
                    'taxable_exceeds_gross', 'net_exceeds_gross', 'text_too_long')),
    value       TEXT    NOT NULL DEFAULT '',
    message     TEXT    NOT NULL,
    FOREIGN KEY (import_id, user_id) REFERENCES imports (id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (import_id, sheet, row_number) REFERENCES import_rows (import_id, sheet, row_number)
        ON DELETE CASCADE
) STRICT;

CREATE INDEX import_issues_import ON import_issues (import_id, sheet, row_number, id);

-- -----------------------------------------------------------------------------
-- import_id on entries. SQLite cannot add a composite foreign key with
-- ALTER TABLE, so tenancy ((import_id, user_id) must name one of the same
-- user's imports) is enforced by triggers instead.
-- -----------------------------------------------------------------------------
ALTER TABLE expenses       ADD COLUMN import_id INTEGER REFERENCES imports (id) ON DELETE SET NULL;
ALTER TABLE income_entries ADD COLUMN import_id INTEGER REFERENCES imports (id) ON DELETE SET NULL;

CREATE INDEX expenses_import       ON expenses (import_id)       WHERE import_id IS NOT NULL;
CREATE INDEX income_entries_import ON income_entries (import_id) WHERE import_id IS NOT NULL;

CREATE TRIGGER expenses_import_tenancy_insert
BEFORE INSERT ON expenses
WHEN NEW.import_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM imports WHERE id = NEW.import_id AND user_id = NEW.user_id)
BEGIN
    SELECT RAISE(ABORT, 'import_id must reference an import of the same user');
END;

CREATE TRIGGER expenses_import_tenancy_update
BEFORE UPDATE OF import_id, user_id ON expenses
WHEN NEW.import_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM imports WHERE id = NEW.import_id AND user_id = NEW.user_id)
BEGIN
    SELECT RAISE(ABORT, 'import_id must reference an import of the same user');
END;

CREATE TRIGGER income_entries_import_tenancy_insert
BEFORE INSERT ON income_entries
WHEN NEW.import_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM imports WHERE id = NEW.import_id AND user_id = NEW.user_id)
BEGIN
    SELECT RAISE(ABORT, 'import_id must reference an import of the same user');
END;

CREATE TRIGGER income_entries_import_tenancy_update
BEFORE UPDATE OF import_id, user_id ON income_entries
WHEN NEW.import_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM imports WHERE id = NEW.import_id AND user_id = NEW.user_id)
BEGIN
    SELECT RAISE(ABORT, 'import_id must reference an import of the same user');
END;

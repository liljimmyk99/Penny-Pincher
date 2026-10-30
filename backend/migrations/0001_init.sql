-- =============================================================================
-- Penny Pincher — initial SQLite schema (migration 0001)
-- =============================================================================
--
-- Conventions
--   * Money is INTEGER cents (never REAL). $12.34 -> 1234.
--     A negative expense amount is a refund / payback.
--   * Calendar dates are TEXT 'YYYY-MM-DD' with no time zone. The month an
--     entry belongs to is derived from its date (there is no month table);
--     refunds count in the month of their own date.
--   * Timestamps are TEXT ISO-8601 UTC ('2026-10-30T18:43:00.000Z').
--     created_at defaults in SQL; updated_at is set by the Go store on write.
--   * Every user-owned row carries user_id. Composite foreign keys
--     (x_id, user_id) make it impossible for one user's row to point at
--     another user's category / merchant / income source / template, so
--     tenancy is enforced by the database as well as by the store layer.
--   * STRICT tables (SQLite >= 3.37) so values are never silently coerced.
--   * Rules that must hold no matter who writes (protected "Other" rows,
--     reassignment on delete, refund links) are enforced by triggers. The Go
--     store still checks them first so it can return friendly API errors.
--
-- Per-connection settings (set in the driver DSN / on open; only journal_mode
-- is persisted in the database file):
--   PRAGMA foreign_keys = ON;      -- required: FKs are OFF by default
--   PRAGMA journal_mode = WAL;
--   PRAGMA busy_timeout = 5000;
--   PRAGMA synchronous = NORMAL;   -- safe with WAL
-- =============================================================================

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- Users. Identity lives in Firebase; this table is the local allowlist plus
-- role. A valid Firebase token whose uid is not here gets 403.
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    firebase_uid  TEXT    NOT NULL UNIQUE,
    email         TEXT    COLLATE NOCASE,
    display_name  TEXT,
    role          TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- -----------------------------------------------------------------------------
-- Expense categories
--   is_protected = 1: the per-user "Other" category. Never renamed, edited or
--     deleted; receives the expenses and template items of a deleted category.
--     It may still be reordered (sort_order) or recolored.
--   is_saving = 1: Saving. Counts as an expense in totals but is presented
--     differently (saving more reads as good). Identified by flag, not name.
-- -----------------------------------------------------------------------------
CREATE TABLE categories (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name          TEXT    NOT NULL COLLATE NOCASE CHECK (length(trim(name)) > 0),
    is_protected  INTEGER NOT NULL DEFAULT 0 CHECK (is_protected IN (0, 1)),
    is_saving     INTEGER NOT NULL DEFAULT 0 CHECK (is_saving IN (0, 1)),
    color         TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, name),
    UNIQUE (id, user_id)                      -- target for composite FKs
) STRICT;

CREATE UNIQUE INDEX categories_one_protected_per_user
    ON categories (user_id) WHERE is_protected = 1;

-- -----------------------------------------------------------------------------
-- Income sources
--   is_protected = 1: the per-user "Other" source. Never renamed or deleted.
--   Any other source can be renamed. Once it has income entries it can never
--   be deleted. A source with no entries can be deleted; its template items
--   move to "Other".
-- -----------------------------------------------------------------------------
CREATE TABLE income_sources (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name          TEXT    NOT NULL COLLATE NOCASE CHECK (length(trim(name)) > 0),
    is_protected  INTEGER NOT NULL DEFAULT 0 CHECK (is_protected IN (0, 1)),
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, name),
    UNIQUE (id, user_id)
) STRICT;

CREATE UNIQUE INDEX income_sources_one_protected_per_user
    ON income_sources (user_id) WHERE is_protected = 1;

-- -----------------------------------------------------------------------------
-- Merchants. A table rather than free text on each expense so autocomplete
-- stays consistent and merchant trends group reliably. COLLATE NOCASE makes
-- "chick-fil-a" equal "Chick-fil-A", and the unique index serves
-- case-insensitive prefix lookups (name LIKE 'chi%').
-- -----------------------------------------------------------------------------
CREATE TABLE merchants (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        TEXT    NOT NULL COLLATE NOCASE CHECK (length(trim(name)) > 0),
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, name),
    UNIQUE (id, user_id)
) STRICT;

-- -----------------------------------------------------------------------------
-- Templates: a full filled-out month, copied into a month and then edited.
-- A user may have several. Editing a month never changes its template.
-- -----------------------------------------------------------------------------
CREATE TABLE templates (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        TEXT    NOT NULL COLLATE NOCASE CHECK (length(trim(name)) > 0),
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, name),
    UNIQUE (id, user_id)
) STRICT;

-- day_of_month 29/30/31 is clamped to the last day of shorter months by the
-- apply logic in Go; it is stored as entered.
CREATE TABLE template_expense_items (
    id            INTEGER PRIMARY KEY,
    template_id   INTEGER NOT NULL,
    user_id       INTEGER NOT NULL,
    category_id   INTEGER NOT NULL,
    merchant_id   INTEGER NOT NULL,
    day_of_month  INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    amount_cents  INTEGER NOT NULL,
    note          TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (template_id, user_id) REFERENCES templates  (id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id, user_id) REFERENCES categories (id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, user_id) REFERENCES merchants  (id, user_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX template_expense_items_template ON template_expense_items (template_id, sort_order);
CREATE INDEX template_expense_items_category ON template_expense_items (category_id);

CREATE TABLE template_income_items (
    id                   INTEGER PRIMARY KEY,
    template_id          INTEGER NOT NULL,
    user_id              INTEGER NOT NULL,
    income_source_id     INTEGER NOT NULL,
    day_of_month         INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    gross_cents          INTEGER NOT NULL CHECK (gross_cents >= 0),
    gross_taxable_cents  INTEGER NOT NULL CHECK (gross_taxable_cents BETWEEN 0 AND gross_cents),
    net_cents            INTEGER NOT NULL CHECK (net_cents BETWEEN 0 AND gross_cents),
    note                 TEXT,
    sort_order           INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (template_id, user_id)      REFERENCES templates      (id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (income_source_id, user_id) REFERENCES income_sources (id, user_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX template_income_items_template ON template_income_items (template_id, sort_order);
CREATE INDEX template_income_items_source   ON template_income_items (income_source_id);

-- -----------------------------------------------------------------------------
-- Template applies. One row per "start month from template". Every entry the
-- apply creates carries its id, so "undo" deletes only that apply's entries
-- that are still unconfirmed. This is a log, not a month table.
-- -----------------------------------------------------------------------------
CREATE TABLE template_applies (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    template_id  INTEGER REFERENCES templates (id) ON DELETE SET NULL,
    year_month   TEXT    NOT NULL CHECK (year_month GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'
                                         AND date(year_month || '-01') IS NOT NULL),
    applied_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX template_applies_user_month ON template_applies (user_id, year_month);

-- -----------------------------------------------------------------------------
-- Expenses
--   amount_cents < 0 => refund. `type` is derived from the sign so it can
--     never disagree with the amount.
--   refunded_expense_id optionally links a refund to the original expense.
--     Several refunds may link to one expense (partial refunds). Deleting the
--     original unlinks its refunds; it never deletes them.
--   confirmed = 0 => copied from a template and not yet reviewed.
-- -----------------------------------------------------------------------------
CREATE TABLE expenses (
    id                   INTEGER PRIMARY KEY,
    user_id              INTEGER NOT NULL,
    category_id          INTEGER NOT NULL,
    merchant_id          INTEGER NOT NULL,
    occurred_on          TEXT    NOT NULL CHECK (date(occurred_on) IS occurred_on),
    amount_cents         INTEGER NOT NULL CHECK (amount_cents <> 0),
    type                 TEXT    GENERATED ALWAYS AS
                                 (CASE WHEN amount_cents < 0 THEN 'refund' ELSE 'expense' END) VIRTUAL,
    note                 TEXT,
    refunded_expense_id  INTEGER REFERENCES expenses (id) ON DELETE SET NULL,
    confirmed            INTEGER NOT NULL DEFAULT 1 CHECK (confirmed IN (0, 1)),
    template_apply_id    INTEGER REFERENCES template_applies (id) ON DELETE SET NULL,
    created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (category_id, user_id) REFERENCES categories (id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, user_id) REFERENCES merchants  (id, user_id) ON DELETE RESTRICT,
    CHECK (refunded_expense_id IS NULL OR amount_cents < 0),
    CHECK (refunded_expense_id IS NULL OR refunded_expense_id <> id)
) STRICT;

CREATE INDEX expenses_user_date     ON expenses (user_id, occurred_on);
CREATE INDEX expenses_user_category ON expenses (user_id, category_id, occurred_on);
CREATE INDEX expenses_user_merchant ON expenses (user_id, merchant_id, occurred_on);
CREATE INDEX expenses_refunded      ON expenses (refunded_expense_id) WHERE refunded_expense_id IS NOT NULL;
CREATE INDEX expenses_unconfirmed   ON expenses (user_id, occurred_on) WHERE confirmed = 0;
CREATE INDEX expenses_apply         ON expenses (template_apply_id) WHERE template_apply_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Income entries: one row per paycheck or one-off job.
--   Tax rate is derived from gross / taxable / net; never stored.
-- -----------------------------------------------------------------------------
CREATE TABLE income_entries (
    id                   INTEGER PRIMARY KEY,
    user_id              INTEGER NOT NULL,
    income_source_id     INTEGER NOT NULL,
    received_on          TEXT    NOT NULL CHECK (date(received_on) IS received_on),
    gross_cents          INTEGER NOT NULL CHECK (gross_cents >= 0),
    gross_taxable_cents  INTEGER NOT NULL CHECK (gross_taxable_cents BETWEEN 0 AND gross_cents),
    net_cents            INTEGER NOT NULL CHECK (net_cents BETWEEN 0 AND gross_cents),
    note                 TEXT,
    confirmed            INTEGER NOT NULL DEFAULT 1 CHECK (confirmed IN (0, 1)),
    template_apply_id    INTEGER REFERENCES template_applies (id) ON DELETE SET NULL,
    created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (income_source_id, user_id) REFERENCES income_sources (id, user_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX income_entries_user_date   ON income_entries (user_id, received_on);
CREATE INDEX income_entries_user_source ON income_entries (user_id, income_source_id, received_on);
CREATE INDEX income_entries_unconfirmed ON income_entries (user_id, received_on) WHERE confirmed = 0;
CREATE INDEX income_entries_apply       ON income_entries (template_apply_id) WHERE template_apply_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Saved trends: match a merchant, a category, or text in the note, measured
-- by amount or count. Deleting the matched merchant or category deletes the
-- saved trend. The by-category MoM / YoY views are computed, not stored.
-- -----------------------------------------------------------------------------
CREATE TABLE saved_trends (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER NOT NULL,
    name         TEXT    NOT NULL COLLATE NOCASE CHECK (length(trim(name)) > 0),
    match_type   TEXT    NOT NULL CHECK (match_type IN ('merchant', 'category', 'note')),
    merchant_id  INTEGER,
    category_id  INTEGER,
    match_text   TEXT,
    measure      TEXT    NOT NULL CHECK (measure IN ('amount', 'count')),
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, user_id) REFERENCES merchants  (id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id, user_id) REFERENCES categories (id, user_id) ON DELETE CASCADE,
    CHECK (
        (match_type = 'merchant' AND merchant_id IS NOT NULL AND category_id IS NULL AND match_text IS NULL) OR
        (match_type = 'category' AND category_id IS NOT NULL AND merchant_id IS NULL AND match_text IS NULL) OR
        (match_type = 'note'     AND length(trim(match_text)) > 0 AND merchant_id IS NULL AND category_id IS NULL)
    ),
    UNIQUE (user_id, name)
) STRICT;

-- =============================================================================
-- Triggers
-- =============================================================================
-- Several triggers check "the owning user still exists". When a user row is
-- deleted, its rows go away by cascade, and these guards let that happen
-- instead of blocking it.

-- Every new user gets the protected "Other" category and income source.
-- The Go seeding step adds the default categories and empty template.
CREATE TRIGGER users_seed_protected_rows
AFTER INSERT ON users
BEGIN
    INSERT INTO categories     (user_id, name, is_protected, sort_order) VALUES (NEW.id, 'Other', 1, 1000000);
    INSERT INTO income_sources (user_id, name, is_protected, sort_order) VALUES (NEW.id, 'Other', 1, 1000000);
END;

-- ---- Categories -------------------------------------------------------------

CREATE TRIGGER categories_protected_no_edit
BEFORE UPDATE OF name, is_protected, is_saving, user_id ON categories
WHEN OLD.is_protected = 1
BEGIN
    SELECT RAISE(ABORT, 'The "Other" category cannot be edited');
END;

CREATE TRIGGER categories_no_promote
BEFORE UPDATE OF is_protected ON categories
WHEN OLD.is_protected = 0 AND NEW.is_protected = 1
BEGIN
    SELECT RAISE(ABORT, 'A category cannot be marked protected');
END;

CREATE TRIGGER categories_protected_no_delete
BEFORE DELETE ON categories
WHEN OLD.is_protected = 1
 AND EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
    SELECT RAISE(ABORT, 'The "Other" category cannot be deleted');
END;

-- Deleting any other category moves its expenses and template items to "Other".
CREATE TRIGGER categories_reassign_to_other
BEFORE DELETE ON categories
WHEN OLD.is_protected = 0
 AND EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
    UPDATE expenses
       SET category_id = (SELECT id FROM categories WHERE user_id = OLD.user_id AND is_protected = 1),
           updated_at  = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE category_id = OLD.id;

    UPDATE template_expense_items
       SET category_id = (SELECT id FROM categories WHERE user_id = OLD.user_id AND is_protected = 1)
     WHERE category_id = OLD.id;
END;

-- ---- Income sources ---------------------------------------------------------

CREATE TRIGGER income_sources_protected_no_edit
BEFORE UPDATE OF name, is_protected, user_id ON income_sources
WHEN OLD.is_protected = 1
BEGIN
    SELECT RAISE(ABORT, 'The "Other" income source cannot be edited');
END;

CREATE TRIGGER income_sources_no_promote
BEFORE UPDATE OF is_protected ON income_sources
WHEN OLD.is_protected = 0 AND NEW.is_protected = 1
BEGIN
    SELECT RAISE(ABORT, 'An income source cannot be marked protected');
END;

CREATE TRIGGER income_sources_protected_no_delete
BEFORE DELETE ON income_sources
WHEN OLD.is_protected = 1
 AND EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
    SELECT RAISE(ABORT, 'The "Other" income source cannot be deleted');
END;

-- Once a source has income entries it can only be renamed, never deleted.
CREATE TRIGGER income_sources_no_delete_with_entries
BEFORE DELETE ON income_sources
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
 AND EXISTS (SELECT 1 FROM income_entries WHERE income_source_id = OLD.id)
BEGIN
    SELECT RAISE(ABORT, 'An income source with income entries cannot be deleted; rename it instead');
END;

-- A source with no entries may be deleted; its template items move to "Other".
CREATE TRIGGER income_sources_reassign_template_items
BEFORE DELETE ON income_sources
WHEN OLD.is_protected = 0
 AND EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
    UPDATE template_income_items
       SET income_source_id = (SELECT id FROM income_sources WHERE user_id = OLD.user_id AND is_protected = 1)
     WHERE income_source_id = OLD.id;
END;

-- ---- Refund links -----------------------------------------------------------

-- A refund must link to a positive expense owned by the same user.
CREATE TRIGGER expenses_refund_link_insert
BEFORE INSERT ON expenses
WHEN NEW.refunded_expense_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM expenses
                  WHERE id = NEW.refunded_expense_id
                    AND user_id = NEW.user_id
                    AND amount_cents > 0)
BEGIN
    SELECT RAISE(ABORT, 'refunded_expense_id must reference a positive expense of the same user');
END;

CREATE TRIGGER expenses_refund_link_update
BEFORE UPDATE OF refunded_expense_id, user_id ON expenses
WHEN NEW.refunded_expense_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM expenses
                  WHERE id = NEW.refunded_expense_id
                    AND user_id = NEW.user_id
                    AND amount_cents > 0)
BEGIN
    SELECT RAISE(ABORT, 'refunded_expense_id must reference a positive expense of the same user');
END;

-- An expense that refunds point at cannot itself become a refund.
CREATE TRIGGER expenses_refunded_stays_positive
BEFORE UPDATE OF amount_cents ON expenses
WHEN NEW.amount_cents < 0
 AND EXISTS (SELECT 1 FROM expenses WHERE refunded_expense_id = OLD.id)
BEGIN
    SELECT RAISE(ABORT, 'An expense with linked refunds cannot have a negative amount');
END;

-- =============================================================================
-- Views: building blocks for summaries and trends. Yearly figures, averages,
-- and MoM / YoY changes are computed over these monthly rows.
-- =============================================================================

-- Spend per category per month, net of refunds, with counts.
CREATE VIEW v_monthly_category_spend AS
SELECT e.user_id,
       substr(e.occurred_on, 1, 7)                          AS year_month,
       e.category_id,
       c.name                                               AS category_name,
       c.is_saving,
       SUM(e.amount_cents)                                  AS total_cents,
       SUM(CASE WHEN e.amount_cents > 0 THEN 1 ELSE 0 END)  AS expense_count,
       SUM(CASE WHEN e.amount_cents < 0 THEN 1 ELSE 0 END)  AS refund_count
  FROM expenses e
  JOIN categories c ON c.id = e.category_id
 GROUP BY e.user_id, year_month, e.category_id;

-- Income per source per month.
CREATE VIEW v_monthly_income_by_source AS
SELECT i.user_id,
       substr(i.received_on, 1, 7) AS year_month,
       i.income_source_id,
       s.name                      AS source_name,
       SUM(i.gross_cents)          AS gross_cents,
       SUM(i.gross_taxable_cents)  AS gross_taxable_cents,
       SUM(i.net_cents)            AS net_cents,
       COUNT(*)                    AS entry_count
  FROM income_entries i
  JOIN income_sources s ON s.id = i.income_source_id
 GROUP BY i.user_id, year_month, i.income_source_id;

-- Income vs. spent per month. spent_cents includes Saving (Saving counts as
-- an expense); saving_cents is broken out so it can be shown separately.
CREATE VIEW v_monthly_totals AS
WITH months_seen AS (
    SELECT user_id, substr(occurred_on, 1, 7) AS year_month FROM expenses
    UNION
    SELECT user_id, substr(received_on, 1, 7) FROM income_entries
),
inc AS (
    SELECT user_id, substr(received_on, 1, 7) AS year_month,
           SUM(gross_cents) AS gross_cents,
           SUM(gross_taxable_cents) AS gross_taxable_cents,
           SUM(net_cents) AS net_cents
      FROM income_entries
     GROUP BY user_id, year_month
),
exp AS (
    SELECT e.user_id, substr(e.occurred_on, 1, 7) AS year_month,
           SUM(e.amount_cents) AS spent_cents,
           SUM(CASE WHEN c.is_saving = 1 THEN e.amount_cents ELSE 0 END) AS saving_cents
      FROM expenses e
      JOIN categories c ON c.id = e.category_id
     GROUP BY e.user_id, year_month
)
SELECT m.user_id,
       m.year_month,
       COALESCE(inc.gross_cents, 0)         AS gross_cents,
       COALESCE(inc.gross_taxable_cents, 0) AS gross_taxable_cents,
       COALESCE(inc.net_cents, 0)           AS net_cents,
       COALESCE(exp.spent_cents, 0)         AS spent_cents,
       COALESCE(exp.saving_cents, 0)        AS saving_cents
  FROM months_seen m
  LEFT JOIN inc ON inc.user_id = m.user_id AND inc.year_month = m.year_month
  LEFT JOIN exp ON exp.user_id = m.user_id AND exp.year_month = m.year_month;

-- Merchant spend per month (merchant trends).
CREATE VIEW v_monthly_merchant_spend AS
SELECT e.user_id,
       substr(e.occurred_on, 1, 7) AS year_month,
       e.merchant_id,
       m.name                      AS merchant_name,
       SUM(e.amount_cents)         AS total_cents,
       COUNT(*)                    AS txn_count
  FROM expenses e
  JOIN merchants m ON m.id = e.merchant_id
 GROUP BY e.user_id, year_month, e.merchant_id;

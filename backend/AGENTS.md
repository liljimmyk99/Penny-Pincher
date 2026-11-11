# AGENTS.md — /backend

Read the root `AGENTS.md` first. This file adds rules specific to the Go API.

## Stack

- Go, SQLite in WAL mode, single API process
- REST/JSON implementing the spec in `/api`. The spec is the contract; change it first.
- Runs in Docker; the SQLite file lives on a mounted volume

## Suggested layout

```
cmd/api/          main.go (wiring only)
internal/auth/    token verification middleware
internal/http/    handlers, routing, request/response types
internal/store/   all SQL; the only package that touches the database
internal/domain/  core types and rules (no HTTP, no SQL)
migrations/       numbered SQL migrations
```

## Rules

- **Money** is `int64` cents. Never use float types for amounts.
- **Dates** are calendar dates stored as `YYYY-MM-DD` text, with no time zone. Months are derived from them.
- **Tenancy:** every query in `internal/store` takes the authenticated `user_id` and filters on it. A handler must never be able to read or write another user's rows. Add a test for this on every new query.
- **Auth:** verify the Firebase ID token on every route except `/healthz`, keeping the verifier behind an interface in `internal/auth`. A valid token is not enough: the Firebase uid must match a row in the local users table, otherwise return 403. This is the allowlist, so people who sign up through Firebase get no access.
- **Roles:** users are `admin` or `member`. Admin routes (`/v1/admin/...`) require `admin` and return 403 otherwise. Provide an admin-only way outside the HTTP API to add a user row (for example a `cmd/` CLI subcommand), since v1 has no in-app account management.
- **Schema:** `migrations/0001_init.sql` defines every table, index, trigger and view. Read its header comment before writing store code.
  - Composite foreign keys `(x_id, user_id)` stop a row from referencing another user's category, merchant, income source or template. The store must still filter every query on `user_id`.
  - Triggers enforce the protected "Other" rows, reassignment on delete, the income-source delete rule, and refund links. The store should check these rules first and return a clear API error; the triggers are the safety net. Trigger failures arrive as SQLite `RAISE(ABORT, ...)` errors.
  - Views `v_monthly_category_spend`, `v_monthly_income_by_source`, `v_monthly_totals` and `v_monthly_merchant_spend` are the building blocks for summaries and trends.
- **New user seeding:** when a user row is inserted, a trigger creates the protected "Other" category and "Other" income source. In the same transaction, the store seeds:
  - the remaining default categories, in order, with Saving's `is_saving=1`
  - an empty template
- **SQLite:** enable `PRAGMA foreign_keys=ON` and WAL mode at startup. Prefer a pure-Go driver (no CGO) so Docker builds stay simple, unless there is a reason not to.
- **Migrations:** every schema change is a new numbered migration. Never edit an applied one. Driver is `modernc.org/sqlite`; a small embedded runner applies them on API startup (and via a `migrate` subcommand). See root `AGENTS.md` §10.
- **Aggregations** (monthly/yearly totals, trends) are done in SQL, not in application loops.
- **Categories:**
  - "Other" can never be renamed or deleted, and its `is_saving`/`is_protected` flags never change. Reject those requests with a clear error. It may be recolored and reordered.
  - Deleting any other category must, in one transaction, move its expenses and template items to the user's "Other" category before removing it.
  - Reordering updates `sort_order` for the whole list in one request.
  - Saving is identified by `is_saving`, never by name.
  - Test every path.
- **Income sources:**
  - "Other" can never be renamed or deleted.
  - Any other source can be renamed.
  - A source that has income entries can **never be deleted**. Reject the request with a clear error that suggests renaming instead.
  - A source with no entries can be deleted; its template items move to "Other" in the same transaction.
  - Sources have a `sort_order`.
  - Test every path.
- **Merchants:** expenses and template expense items reference a `merchants` row. Creating or editing an expense with a merchant name looks the name up case-insensitively for that user and creates it if missing. Autocomplete is a prefix search on that table.
- **Refunds:**
  - A refund counts in the month of **its own date**, in its own category, even when the original was in an earlier month. Summaries and trends subtract it there.
  - Several refunds may point at the same expense (partial refunds). Do not store a "net" on the original.
  - Deleting an expense sets `refunded_expense_id` to NULL on any refund pointing at it; it never deletes the refund.
- **Templates:**
  - Template items have a `day_of_month` (1–31). Expense items have an amount; income items have gross, gross taxable and net.
  - Applying a template to a month dates each copy on its day of month, **clamped to the last day of the month** when the day doesn't exist (for example 31 in April → April 30; 29, 30 or 31 in February → Feb 28 or 29). Use real calendar maths, including leap years.
  - Copies are `confirmed=0`.
  - Each apply inserts a `template_applies` row, and every entry it creates stores that row's id in `template_apply_id`. "Undo" deletes only that apply's rows that are still unconfirmed.
  - **Applying to a month that already has data** (any expense or income entry dated in it) is rejected with `month_not_empty` unless the request sets `reset_month: true`. With it, in one transaction: delete every expense and income entry dated in that month (confirmed or not; refunds elsewhere that pointed at deleted expenses are unlinked), delete that month's earlier `template_applies` rows, then apply as normal.
  - "Save month as template" copies the month's expenses and income entries, with `day_of_month` taken from each date, and **skips refunds**.
  - Provide a "confirm all" action for a month.
- **Trends:**
  - Saved trends (match type `merchant` | `category` | `note`, match value, measure `amount` | `count`) are per-user CRUD.
  - The by-category view needs monthly totals per category for the selected year **and the previous year**, so month-over-month (January compares with the previous December) and year-over-year changes can be computed. Compute totals in SQL; clients compute percentages and colours.
  - Whether a change counts as better or worse depends on `is_saving` (for Saving, up is better). Expose the flag rather than encoding colours in the API.
- **Imports** (root §6.14 and §10):
  - Upload parses the `.xlsx` (10 MB, 50,000 rows max), checks every row and stores the parsed rows and their problems with the `imports` row. It never writes expenses or income entries. Categories and sources match by name case-insensitively; unknown names are problems. Dollar amounts convert to cents exactly (more than two decimals is a problem; never via float).
  - Start runs a background goroutine owned by the API process. It writes ready rows in batches, oldest month first, each batch in its own transaction, tagging every row with `import_id`, and publishes progress to the SSE stream. One running import per user.
  - Cancel, undo and failure delete every expense and income entry with that `import_id` in one transaction (refunds linked to deleted expenses are unlinked, as usual). On start-up, any import still `running` becomes `failed` and its rows are deleted.
  - The SSE handler (`text/event-stream`) needs flushing, which the strict server's response types don't give; write it as a custom response (or a plain handler) and keep auth and tenancy the same as every other route. Send a `: ping` comment every 15 seconds.
  - Never log cell values, file contents or file names beyond the import id.
  - Upload, template, problem rows and history (#95): `internal/imports` builds the template (`Template`), reads and checks an upload (`Parse`, `ParseCents`) and writes the problem-rows workbook (`Problems`); `internal/http/imports.go` holds the handlers. A problem row keeps whatever parsed (including its date, which puts it in the per-year table) plus `original`, the cells as text. Amounts from numeric Excel cells with an exponent or over nine decimals are rounded to Excel's 15 significant digits before the exact decimal conversion, because Excel stores a typed 19.99 as a binary double. `$` and thousands separators are `invalid_number`. Reads (`list`, `get`, `discard`, `problems`) expire the caller's stale review imports first; `main` also sweeps every 15 minutes.
  - Runner (#96): `internal/importrun` owns the import goroutines (one per running import, on the process context, never the request's), 200 rows per transaction (`store.Imports.WriteBatch`, which also advances `rows_done` and refuses to write once the import is no longer `running`). Category and source names are matched to ids at start; if one has gone since upload, the import ends `failed` with nothing written. Progress (rows done/total, current month, ETA, per-year counts) is held in memory and read by `getImport` and the stream. Cancel signals the goroutine and waits for its rollback; undo (`completed` only), cancel and failure all go through `store.Imports.Rollback` (delete entries and set status in one transaction). `main` calls `RecoverRunning` before serving. The event stream is `eventStream` in `internal/http/import_run.go`: `progress` on connect and after updates (at most 4 a second), `: ping` every 15 s, then `finished`; `http.Server.BaseContext` ends open streams at shutdown.
- **Excel files** (root §10, #93): use `github.com/xuri/excelize/v2` for every `.xlsx` read and write. Read uploads with the streaming `Rows` iterator, `RawCellValue: true` and one `Columns` call per row; accept Excel date serials (`ExcelDateToTime`) as well as `YYYY-MM-DD` text. Always open uploads with `UnzipSizeLimit` and `UnzipXMLSizeLimit` set. The template's category and source dropdowns read from a hidden `Lists` sheet. `internal/xlsxspike` holds the spike tests that pin this behaviour.
- **Request limits** (`internal/http/limits.go`, root §10): body caps, per-route write deadlines, and per-IP and per-user rate limits wrap the router. A new streaming route (SSE, a long download) must be added to `streamingRoute`, or its 30 s write deadline will cut it off; a new expensive route goes in `expensiveRoute`. A handler that reads the body itself (the multipart import upload) must answer `isTooLarge` errors with `writeTooLarge`. `Deps.Limits` is nil in the handler tests (no rate limiting); `main` passes `DefaultLimits`.
- **Logging:** never log amounts, merchants, notes, or tokens.
- **Config** comes from environment variables. Never commit secrets.
- Errors are returned in the format defined in `/api`; do not leak internals.

## Testing

- Use a temporary SQLite database per test; do not mock the store.
- Cover:
  - tenancy isolation
  - refund linking and unlinking, including partial refunds and refunds counted in a later month
  - template-to-month copy: day-of-month dating, clamping for 29/30/31 including February in leap and non-leap years, `confirmed=false`, and undo removing only unconfirmed rows from that apply
  - applying to a non-empty month: rejected without `reset_month`; with it, the month's old entries are gone, other months are untouched, and refunds in other months are unlinked rather than deleted
  - save month as template skips refunds
  - protected "Other" category and income source: rename, edit and delete are rejected; reassignment on delete
  - income sources: renaming works; deleting a source with entries is rejected; deleting one without entries moves its template items to "Other"
  - new-user seeding
  - admin-route authorization (members get 403)
  - summaries, trend filters, and month-over-month and year-over-year totals across a year boundary
- Run `go vet ./...` and `go test ./...` before finishing.

## Endpoints to implement (v1)

- Income sources and categories, including reorder and their per-year stats
- Income entries
- Expenses, including refund linking and "confirm all" for a month
- Templates:
  - "start month from template", with undo
  - "save month as template"
- Monthly and yearly summaries
- Trends:
  - custom trend queries
  - saved trends
  - by-category monthly totals for this year and last
- `/healthz`
- **Admin (admins only):**
  - status: version, uptime, database size and last write, backup schedule and last run, sign-in provider connectivity
  - list backup snapshots
  - start a backup now
  - download an encrypted snapshot
- Import (last, with export): template download, upload and check, start, progress stream, cancel, undo, problem rows, history
- Export (last)

**Not in v1:** any user or account management endpoints (list users, create, invite, reset password, disable). Those stay in the Firebase console until v2.

## Generated API code

- `internal/api/*.gen.go` is generated from `/api/openapi.yaml` (oapi-codegen, pinned as a `tool` in `go.mod`). Never edit it by hand; run `make generate` after any spec change. `make check-generate` fails if the committed output is stale.
- Codegen options live in `internal/api/oapi-codegen.yaml`. `nullable-type` is on, so nullable fields are `nullable.Nullable[T]`: a PATCH handler uses `IsSpecified()` to tell an omitted field from `null` (which clears it). In responses, always set nullable fields (use `nullableOf` in `internal/http`); an unset one would marshal as the zero value, not `null`.
- `internal/http.Server` implements the generated `StrictServerInterface` and embeds `api.Unimplemented`; any operation it does not override answers `501 not_implemented` with the standard error body. To build an endpoint, add a method on `Server`.
- All error responses (decode errors, 501, 500) use the spec's `Error` body via `internal/http/errors.go`.

## Backups

- `internal/backup` takes `VACUUM INTO` snapshots, encrypts them to the age public key in `BACKUP_AGE_RECIPIENT`, and uploads to the S3 bucket (`BACKUP_S3_*`). The API never decrypts; only `api backup restore` does, with a private key file.
- The admin API (`internal/http/admin.go`) uses `Service.Start` (background manual run, `ErrBusy` → 409 `backup_in_progress`), `Runs` (stored snapshots of every kind plus this process's running or failed run), `LastRun` (status tile) and `Open` (streams the still-encrypted object; only keys the listing shows). Snapshot ids are the base64url of the bucket key; running/failed runs have `run-` ids and answer download with 409 `backup_not_ready`. Failed runs show a fixed message, never error text. Without backup config the list is empty and "Back up now" answers 501.
- Never log snapshot contents or error text; log the error type only. Runbook: `/docs/backups.md`.
- The plaintext snapshot is written under `os.TempDir()`, which Compose mounts as `tmpfs` so it never touches disk; don't move it to `/data` or another disk path. `BACKUP_S3_INSECURE=1` (plain HTTP to the bucket) is refused unless `FIREBASE_PROJECT_ID` starts with `demo-`. See `/docs/encryption.md`.

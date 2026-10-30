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
- **SQLite:** enable `PRAGMA foreign_keys=ON` and WAL mode at startup. Prefer a pure-Go driver (no CGO) so Docker builds stay simple, unless there is a reason not to.
- **Migrations:** every schema change is a new numbered migration. Never edit an applied one.
- **Aggregations** (monthly/yearly totals, trends) are done in SQL, not in application loops.
- **Refunds:** deleting an expense sets `refunded_expense_id` to NULL on any refund pointing at it; it never deletes the refund.
- **Logging:** never log amounts, merchants, notes, or tokens.
- **Config** comes from environment variables. Never commit secrets.
- Errors are returned in the format defined in `/api`; do not leak internals.

## Testing

- Use a temporary SQLite database per test; do not mock the store.
- Cover: tenancy isolation, refund linking and unlinking, template-to-month copy (dated the 1st, `confirmed=false`), summaries, and trend filters.
- Run `go vet ./...` and `go test ./...` before finishing.

## Endpoints to implement (v1)

Income sources, income entries, categories, expenses, templates (including "start month from template" and "save month as template"), monthly/yearly summaries, trends, `/healthz`, and export (last).

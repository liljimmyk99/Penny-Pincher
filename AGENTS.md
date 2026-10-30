# AGENTS.md — Spend Tracker

Read this file first. It is the source of truth for requirements, use cases, and scope.
If a task conflicts with this file, stop and ask; if the task changes requirements, update this file in the same change.

## 1. Purpose

A manual-entry personal spend tracker. The user records monthly income by source (gross, gross taxable, net) and all expenses by category, then views totals and trends by month and year. No bank syncing. Delivered as a web app and a native macOS app backed by one self-hosted API.

## 2. Repo layout (monorepo)

```
/backend    Go API, SQLite migrations, Dockerfile
/web        React app
/mac        SwiftUI macOS app
/api        OpenAPI spec — the contract all clients build against
/docs       supporting notes
AGENTS.md   this file (each folder may add a short AGENTS.md with local rules)
docker-compose.yml
```

## 3. Stack

- Backend: Go, SQLite (WAL mode, single API container, DB file on a Docker volume)
- API: REST/JSON, described by OpenAPI in `/api`. Change the spec first, then backend, then clients.
- Web: React
- Mac: SwiftUI (native)
- Auth: Firebase Authentication (v1). Backend verifies Firebase ID tokens on every request, and only accepts users that exist in its own users table (an allowlist, regardless of provider sign-up settings).
- Deployment: Docker Compose (API, reverse proxy with automatic HTTPS), self-hosted, possibly on a cloud VPS

## 4. Users and tenancy

- v1: a single user. Later: roughly 3–5 users, each with fully private data and their own templates. No sharing between users.
- Every table has `user_id`, and every query is scoped to the authenticated user. Build this in from day one.
- Sign-ups are disabled or allowlisted. Accounts are created by an admin.

## 5. Domain model

All money is stored as **integer cents**. Never use floats.

- **User**: id, auth provider uid
- **IncomeSource**: user, name, active
- **IncomeEntry**: user, source, date, gross, gross taxable, net, optional note. One row per paycheck or one-off job.
- **Category**: user, name, sort order. Seeded: Saving, Housing, Utilities, Food, Transportation, Entertainment, Debt, Other
- **Expense**: user, category, date, merchant, amount, optional note, type (`expense` | `refund`), optional `refunded_expense_id`, `confirmed` flag
- **Template**: user, name. A template is a full filled-out month (like a spreadsheet "Example Month" tab). A user may have several.
- **TemplateItem**: template, kind (expense | income), category or source, label/merchant, default amount

Rules:
- Months are derived from dates; there is no month table.
- Tax rate is derived from gross, gross taxable, and net; do not store it.
- Saving **counts as an expense** in totals. Reports still show Saving as its own line.
- A refund is a negative amount, styled distinctly, and may optionally link to the original expense. Deleting the original unlinks the refund; it does not delete it.
- Merchant is a free-text field with autocomplete from previously used merchants, so spellings stay consistent for trends.

## 6. v1 use cases

1. Sign in / sign out.
2. Add expenses, singly or in batches, as they happen or later.
3. Add income entries (several per month, by source, including one-offs).
4. Land on the **current month** summary:
   - Income total per source. Tapping a source opens a modal listing that month's income entries (gross, taxable, net).
   - Spending total per category, plus overall income, total spent, and left over. Tapping a category amount only highlights its row; it shows no extra information.
5. Details view: every expense for the month. Refunds look visually different. Unconfirmed items are flagged.
6. Browse any past month.
7. Edit and delete expenses and income entries.
8. Manage categories, income sources, and templates.
9. Start a month from a template: copies every template item into the month as real entries, dated the 1st, marked **not yet confirmed** (visibly flagged until the user edits or confirms them). Editing a month never changes the template. "Save this month as a template" is supported.
10. Summaries: total spending across categories, and across months and years.
11. Custom trends: the user picks a filter (category, merchant, text, date range) and sees it charted per month or year (for example, one merchant each month).
12. Export to CSV/Excel. **This is the last v1 item**, built after the UI and backend for everything above are complete.

## 7. Scope

**In v1:** everything in section 6; web + Mac clients; online-only; Dockerized backend.

**Out of v1 (do not build):**
- Bank/card syncing, CSV/statement import
- Budgets, budget-vs-actual, recommended percentages, what-if calculations (v2)
- Debt tracking, net worth
- Recurring-item automation (users copy a template instead)
- Receipt scanning, multi-currency
- Sharing between users or household budgets
- Offline mode (planned later: cached read-only; add/edit must show an error when offline)
- In-app admin dashboard (v2)

## 8. Non-functional requirements

- HTTPS only, via reverse proxy with automatic certificates
- Token verification on every API request; all data access scoped by `user_id`
- Admin tasks in v1 (list users, create accounts, password resets) use the Firebase console. Expose a `/healthz` endpoint for app status.
- Backups: weekly and monthly snapshots of the SQLite database, encrypted, stored off the server. Restore must be tested.
- Secrets in environment files, never committed
- No financial data in logs
- Performance is not a concern at this scale; favor simplicity

## 9. Rules for agents

- Do not add features outside section 6. Propose scope changes instead of implementing them.
- Keep the OpenAPI spec, backend, and clients consistent; update the spec first.
- Use integer cents everywhere, including in clients and exports.
- Every schema change is a migration, with tests where behavior changes.
- Prefer small, reviewable changes. Run the relevant tests before finishing.
- Do not hard-code personal data (names, amounts, employers) in code, seeds, or tests; use generic fixtures.
- When requirements are ambiguous, ask rather than guess, then record the answer here.

## 10. Open decisions

- Go SQLite driver and migration tool
- Web UI library and charting library
- Backup tooling and destination (e.g. restic to object storage)

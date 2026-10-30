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
- Sign-ups are disabled or allowlisted. Accounts are created by an admin. In v1 that happens outside the app: in the Firebase console plus an admin-only step that adds the user to the local users table (for example a backend CLI command). In-app account management is v2.
- Users have a role: `admin` or `member`. Only admins can open the admin panel.
- **New accounts are seeded** with:
  - the default categories (Saving flagged as saving; Other protected)
  - an "Other" income source (protected)
  - an empty template
- The protected "Other" category and "Other" income source are created by a database trigger when the user row is inserted; the backend seeds the rest.

## 5. Domain model

All money is stored as **integer cents**. Never use floats.

The schema is defined in `backend/migrations/0001_init.sql` (SQLite). That file is the reference for table and column names.

- **User**: id, Firebase uid, role (`admin` | `member`)
- **IncomeSource**: user, name, sort order, `is_protected`. Seeded: Other (protected)
- **IncomeEntry**: user, source, date, gross, gross taxable, net, optional note, `confirmed` flag, optional template apply. One row per paycheck or one-off job.
- **Category**: user, name, sort order, color, `is_saving` flag, `is_protected`. Seeded: Saving (`is_saving`), Housing, Utilities, Food, Transportation, Entertainment, Debt, Other (protected)
- **Merchant**: user, name (case-insensitive, unique per user). Expenses reference a merchant row; autocomplete reads from this table.
- **Expense**: user, category, merchant, date, amount, optional note, type (`expense` | `refund`, derived from the amount's sign), optional `refunded_expense_id`, `confirmed` flag, optional template apply
- **Template**: user, name. A template is a full filled-out month (like a spreadsheet "Example Month" tab). A user may have several.
- **TemplateExpenseItem**: template, category, merchant, **day of month** (1–31), amount, optional note, sort order
- **TemplateIncomeItem**: template, income source, **day of month** (1–31), gross, gross taxable, net, optional note, sort order
- **TemplateApply**: user, template, month (`YYYY-MM`), applied at. One row per "start month from template"; the entries it creates point at it so it can be undone.
- **SavedTrend**: user, name, match type (`merchant` | `category` | `note`), the matched merchant, category or note text, measure (`amount` | `count`)

Rules:
- Months are derived from dates; there is no month table. (TemplateApply is a log of applies, not a month table.)
- Tax rate is derived from gross, gross taxable, and net; do not store it.
- Saving **counts as an expense** in totals. Reports still show Saving as its own line.
- A refund is a negative amount, styled distinctly, and may optionally link to the original expense. Deleting the original unlinks the refund; it does not delete it.
- **Refunds count in the month they are logged**, even when the original purchase was in an earlier month. They lower that month's spending in the refund's own category.
- An expense may have several linked refunds (partial refunds). Clients may show the original's net (amount minus linked refunds) for display only; never store it.
- Merchants are stored per user and matched case-insensitively. Entering a new merchant name creates the merchant; autocomplete suggests existing ones, so spellings stay consistent for trends.
- **"Other" is a protected category:** it is seeded for every user and **can never be renamed, edited, or deleted**. Deleting any other category reassigns all of its expenses, and any template items in it, to "Other" in the same transaction. Nothing is orphaned and no expense is deleted. Saved trends that match the deleted category are removed.
- **Income sources:**
  - The **"Other" income source** is protected: it can never be renamed or deleted.
  - Any other source can be renamed at any time.
  - **Once a source has income entries, it can never be deleted**, only renamed.
  - A source with no income entries can be deleted; any template items that use it move to "Other".
- These rules are enforced by database triggers as well as by the backend.
- Saving is identified by the `is_saving` flag, not by its name, so renaming it keeps its special treatment.

## 6. v1 use cases

1. Sign in / sign out with Firebase: Google or email and password. "Forgot password" sends Firebase's reset email. There is no sign-up screen.
2. Add expenses, singly or in batches, as they happen or later.
3. Add income entries (several per month, by source, including one-offs).
4. Land on the **current month** summary:
   - Income total per source. Tapping a source opens a modal listing that month's income entries (gross, taxable, net).
   - Spending total per category, plus overall income, total spent, and left over. Tapping a category amount only highlights its row; it shows no extra information.
5. Details view: every expense for the month. Refunds look visually different. Unconfirmed items are flagged.
6. Browse any past month.
7. Edit and delete expenses and income entries.
8. Manage categories, income sources, and templates. (Income sources with entries can be renamed but not deleted; see section 5.)
9. Start a month from a template:
   - Every template item is copied into the month as a real entry, dated on the item's **day of month**.
   - If that day doesn't exist in the month (29, 30 or 31 in a shorter month), the entry is dated on the **last day of the month** instead.
   - Copies are marked **not yet confirmed** and stay visibly flagged until the user edits or confirms them. "Confirm all as-is" confirms them in one step.
   - Right after copying, the user can **undo**. This deletes the entries that copy created that are still unconfirmed.
   - Editing a month never changes the template. "Save this month as a template" is supported.
   - An empty new month offers to copy the template or start blank.
10. Summaries (totals only; budgets and what-if are v2):
    - **Monthly:** laid out vertically like the user's spreadsheet. Income shows gross, gross taxable, and net per source, plus the **calculated tax rate** (derived, never stored), followed by an **"All sources combined"** block with the same four figures totaled across sources. Spending shows each category with its total, its **percent of income**, and a **comparison to the previous month**.
    - **Yearly:** all three of (a) a month-by-month table (income, spent, left over per month), (b) category totals for the year, and (c) monthly averages. **Tapping a month's row** opens that month's summary, read-only. There is no separate column or button for this.
    - **Saving** is counted as an expense in totals but is **presented differently** from ordinary spending (its own visual treatment and its own line), because the user uses it to see where post-paycheck savings and investments go. A savings rate is not required in v1.
11. Trends, in two views:
    - **Custom trends:** the user picks a filter (category, merchant, text, date range) **and the measure** (total amount or number of transactions) and sees it charted per month or year (for example, one merchant each month). Trends can be saved (SavedTrend) and reopened.
    - **By category:** for any category, or all spending, show:
      - how spend changed **month over month** (January compares with the previous December)
      - how it changed **year over year** (same month last year, and year to date vs. last year)
      - a "biggest movers" ranking of every category's year-over-year change for the selected month
    - **Change indicators:** orange means spending went up (worse), blue means it went down (better). For **Saving the meaning flips**: saving more is shown as positive (blue). An arrow and a +/− sign always accompany the colour.
    - **Approved chart types** (use only these):
      - Category spending as **ranked horizontal bars**
      - Category share as a **donut**
      - **Income vs. spent per month** as paired vertical bars
      - Custom trend as **vertical bars per period** (including small sparkline bars in lists)
      - **This year vs. last year per month** as paired vertical bars
      - **Biggest movers** as **diverging horizontal bars** around a zero line
    - Not approved: stacked bars, line charts.
    - Saving keeps its own distinct color in every chart.
    - **Chart placement:**
      - **Monthly summary:** ranked category bars by default, with a toggle to switch to the category donut. Both show the same month's data.
      - **Yearly view:** income vs. spent paired bars per month, placed above the month-by-month table. Also ranked category bars showing each category's **monthly average** for the year.
      - **Custom trends:** vertical bars per month or year, for whichever measure the user picked (amount or count).
      - **Trends by category:** this-year vs. last-year paired bars per month, with the biggest-movers diverging bars beside them.
12. **Admin panel** (admins only, web only), limited in v1 to app status and backups:
    - Status: API health and version (from `/healthz`), database size and last write, backup schedule and last run, sign-in provider connectivity.
    - Backups: a list of snapshots, "Back up now", and download of the encrypted snapshot.
    - **Not in v1:** account-specific tiles and actions (user list, user counts, create account, invites, password reset, disable/enable). Those stay in the Firebase console until v2.
13. Export to CSV/Excel. **This is the last v1 item**, built after the UI and backend for everything above are complete.

## 7. Scope

**In v1:** everything in section 6; web + Mac clients; online-only; Dockerized backend.

**Out of v1 (do not build):**
- Bank/card syncing, CSV/statement import, importing the user's old spreadsheet (the app starts empty)
- Budgets, budget-vs-actual, recommended percentages, what-if calculations (v2)
- Debt tracking, net worth
- Recurring-item automation (users copy a template instead)
- Receipt scanning, multi-currency
- Sharing between users or household budgets
- Offline mode (planned later: cached read-only; add/edit must show an error when offline)
- In-app account management in the admin panel: user list, create account, invites, password resets, disable/enable (v2)

## 8. Non-functional requirements

- HTTPS only, via reverse proxy with automatic certificates
- Token verification on every API request; all data access scoped by `user_id`
- Account admin tasks in v1 (list users, create accounts, password resets) use the Firebase console. Expose a `/healthz` endpoint for app status, which the admin panel also reads.
- Backups: weekly (Sundays) and monthly (the 1st) snapshots of the SQLite database, encrypted, stored off the server. Keep the last 8 weekly and 12 monthly. Admins can also start one manually from the admin panel. Restore must be tested.
- Admins never see other users' entries through the app. Backup downloads are the encrypted archive only.
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

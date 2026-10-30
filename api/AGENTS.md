# AGENTS.md — /api

Read the root `AGENTS.md` first. This folder holds the OpenAPI spec (`openapi.yaml`, OpenAPI 3.1), the single contract between the backend, the web app, and the Mac app.

## Rules

- **Spec first:** any change to request/response shapes starts here. Then update the backend, then the clients, ideally in one commit.
- Keep the spec valid and in one source of truth; clients generate or mirror their types from it.
- Lint from this folder with `npx @redocly/cli lint` (config in `redocly.yaml`). It must pass with no errors or warnings; an intentional exception goes in `.redocly.lint-ignore.yaml` with a comment saying why.
- Version routes under `/v1`.

## Conventions

- **Money:** integer cents (`integer`, int64). Never decimals or strings.
- **Dates:** calendar dates as `YYYY-MM-DD`. No time zones.
- **IDs:** opaque strings.
- **Auth:** bearer token on every route except `/healthz`. All data is scoped to the authenticated user; `user_id` is never accepted from the client.
- **Errors:** one consistent error body (code, message) across all routes.
- **Lists:** filterable by month where relevant; paginated if they can grow large.

## Resources (v1)

- `income-sources`, `income-entries`:
  - sources have sort order; "Other" is protected, so rename and delete return an error
  - other sources can be renamed; deleting a source that has income entries returns an error
- `categories` (sort order, `is_saving`; "Other" is protected, so rename and delete return an error, but it can be recolored and reordered)
- `expenses`:
  - type `expense` | `refund` is read-only, derived from the amount's sign (refunds are negative)
  - optional `refunded_expense_id`, `confirmed`
  - merchant is sent as a name; the backend matches or creates the merchant
  - several refunds may link to one expense
  - a "confirm all" action for a month
- `templates` and template items:
  - items have a `day_of_month`
  - actions: start a month from a template (returns an apply id, so it can be undone), undo an apply, save a month as a template (skips refunds)
  - applying to a month that has data returns `month_not_empty`; the client asks the user to confirm a full reset of the month, then retries with `reset_month: true`
- `summaries` (totals by category and by month/year)
- `trends`:
  - filter by category, merchant, text, date range; grouped by month or year
  - by-category monthly totals for a year and the previous year
- `saved-trends` (name, match type, match value, measure)
- `merchants` (autocomplete suggestions)
- `admin` (admins only):
  - status
  - backups: list, run now, download encrypted snapshot
  - no user-management routes in v1
- `export` (CSV/Excel; built last)
- `/healthz` (no auth)

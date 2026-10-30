# AGENTS.md — /api

Read the root `AGENTS.md` first. This folder holds the OpenAPI spec, the single contract between the backend, the web app, and the Mac app.

## Rules

- **Spec first:** any change to request/response shapes starts here. Then update the backend, then the clients, ideally in one commit.
- Keep the spec valid (lint it) and in one source of truth; clients generate or mirror their types from it.
- Version routes under `/v1`.

## Conventions

- **Money:** integer cents (`integer`, int64). Never decimals or strings.
- **Dates:** calendar dates as `YYYY-MM-DD`. No time zones.
- **IDs:** opaque strings.
- **Auth:** bearer token on every route except `/healthz`. All data is scoped to the authenticated user; `user_id` is never accepted from the client.
- **Errors:** one consistent error body (code, message) across all routes.
- **Lists:** filterable by month where relevant; paginated if they can grow large.

## Resources (v1)

- `income-sources`, `income-entries`
- `categories`
- `expenses` (type `expense` | `refund`, optional `refunded_expense_id`, `confirmed`)
- `templates` and template items, plus actions: start a month from a template, save a month as a template
- `summaries` (totals by category and by month/year)
- `trends` (filter by category, merchant, text, date range; grouped by month or year)
- `merchants` (autocomplete suggestions)
- `export` (CSV/Excel; built last)
- `/healthz` (no auth)

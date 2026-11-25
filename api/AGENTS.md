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
- **Auth:** an opaque session token (from `POST /v1/auth/login`) sent as a bearer token on every route except `/healthz` and `auth/login`. All data is scoped to the authenticated user; `user_id` is never accepted from the client.
  - Auth errors: `401 unauthenticated` (missing, unknown or revoked token), `401 session_expired` (older than 30 days), `401 invalid_credentials` (login only, one generic answer for a wrong username or a wrong password), `403 password_change_required` (the user must choose a new password first: every route except `auth/password`, `auth/logout` and `me` returns it).
  - The spec describes tokens as opaque strings; clients never parse them. No route accepts or returns a password hash.
- **Errors:** one consistent error body (code, message) across all routes.
- **Limits:** any route can return `413 request_too_large` and `429 rate_limited` (with `Retry-After`). They are described once in the spec's Conventions, not on each route; only the expensive routes (back up now, import upload, export) list `429` explicitly.
- **Lists:** filterable by month where relevant; paginated if they can grow large.
- **Streams:** long-running work reports progress with Server-Sent Events (`text/event-stream`), documented on the route: event names and the schema of each event's JSON `data`.

## Resources (v1)

- `income-sources`, `income-entries`:
  - sources have sort order; "Other" is protected, so rename and delete return an error
  - other sources can be renamed; deleting a source that has income entries returns an error
- `categories` (sort order, `is_saving`; "Other" is protected, so rename and delete return an error, but it can be recolored and reordered)
- `categories/stats` and `income-sources/stats` (`?year=`): per-row entry counts (all time) and totals (all time and the year for categories; the year's gross, gross taxable and net for sources) for the Categories & sources screen
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
- `auth` (username and password; replaces Firebase, see root §10):
  - `POST auth/login` (no bearer): `username` and `password` in, session `token`, `expires_at`, the user and `must_change_password` out. Rate limited per client IP and per username (`429 rate_limited`)
  - `POST auth/logout`: revokes the calling session
  - `POST auth/password`: `current_password` and `new_password` (at least 12 characters, else `400 weak_password` with a field error). Revokes every other session, returns a fresh token, and clears `must_change_password`
  - `GET me` (the signed-in user: username, display name, email, role, `must_change_password`)
- `admin` (admins only):
  - status
  - backups: list, run now, download encrypted snapshot
  - users (account details only, never entries, amounts or counts):
    - `GET admin/users`: username, display name, email, role, `must_change_password`, added date
    - `POST admin/users`: add a user with `username`, initial `password`, `role`, optional `display_name` and `email`, and `must_change_password` (default true). Seeds the account like the CLI. `409 user_exists` for a taken username (compared case-insensitively)
    - `POST admin/users/{id}/password`: reset a user's password (`password`, `must_change_password`). Revokes all of that user's sessions
    - no edit-role, disable or remove routes in v1
- `imports` (Excel import; built last, with export):
  - `GET imports/template` (per-user `.xlsx` with category and source dropdowns)
  - upload (`multipart/form-data`) checks every row and returns status `review`; nothing is saved until `start`
  - `start` (202, runs in the background), `events` (Server-Sent Events: `progress`, then `finished`), `cancel` (rolls back), `undo` (deletes the batch), `problems` (`.xlsx` of rows with problems), discard a `review` import
  - `409 import_in_progress` (one running import per user), `409 import_wrong_status`, `400 invalid_import_file`, `413 file_too_large`
- `export` (CSV/Excel; built last)
- `/healthz` (no auth)

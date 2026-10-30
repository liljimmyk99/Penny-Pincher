# AGENTS.md — /web

Read the root `AGENTS.md` first. This file adds rules specific to the React web app.

## Stack

- React (TypeScript recommended)
- Talks only to the backend API described in `/api`. Generate the API client/types from the OpenAPI spec rather than hand-writing them.
- Auth uses the Firebase JS SDK. UI library and charting library are open decisions (see root file). Do not add a major dependency without noting it there.

## Rules

- **Money** arrives as integer cents. Convert to display strings in one shared formatting utility; never do arithmetic on floats or on formatted strings.
- **Dates** are `YYYY-MM-DD` calendar dates. Do not let time zones shift them.
- **Online-only in v1:** no offline cache and no storing financial data in localStorage/sessionStorage. Show a clear error when a request fails.
- Keep server state in a data-fetching layer (e.g. TanStack Query or equivalent), not copied into component state.
- Auth is Firebase Authentication; keep the SDK behind a small wrapper module so the rest of the app never imports it directly.

## Required UI behavior

- **Landing view:** the current month.
  - Income total per source. Tapping a source opens a **modal** listing that month's income entries (gross, taxable, net).
  - Spending total per category, plus total income, total spent, and left over. Tapping a category amount only **highlights the row**; it does not open anything.
- **Details view:** all expenses for the month.
- **Refunds** are visually distinct from other transactions and may link to the original expense.
- **Unconfirmed items** (copied from a template and not yet edited) carry a clear visual flag until the user edits or confirms them.
- Merchant input offers autocomplete from previously used merchants.
- Fast entry matters: adding one expense, or several in a row, should take few steps.
- Custom trends: filter by category, merchant, text, and date range, charted per month or year.

## Quality

- Keyboard accessible, readable contrast, responsive down to laptop-sized windows.
- Test money formatting, the income modal, refund and unconfirmed styling, and the template-copy flow.
- Run the linter, type check, and tests before finishing.

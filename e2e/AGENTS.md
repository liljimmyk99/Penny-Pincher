# AGENTS.md — /e2e

Read the root `AGENTS.md` first. This folder is the end-to-end suite: Playwright driving the real Docker stack. It automates the **M1 testing gate**'s smoke checklist.

## Running it

```
cd e2e
npm ci
npx playwright install chromium
npm test                 # builds + starts compose.yml, runs every spec, removes the stack
```

- `E2E_KEEP_STACK=1 npm test` leaves the stack running afterwards.
- `npm run stack:up` once, then `E2E_SKIP_STACK=1 npx playwright test …` reruns specs against the running stack. `npm run stack:down` removes it, volume included.
- The stack is compose project `pp-e2e` on ports 18443 (Caddy, `https://localhost:18443`) and 19099 (auth emulator), so it never touches the dev stack or its data.
- CI runs it as the `e2e` job (`.github/workflows/ci.yml`); a failure uploads the Playwright report with traces.

## How it works

- `compose.yml` uses the same API and web images and the same `deploy/Caddyfile` as the root `docker-compose.yml` (dev profile). The **Firebase Auth emulator** (`auth-emulator/`) replaces real Firebase.
  - **API:** `FIREBASE_AUTH_EMULATOR_HOST` makes the Admin SDK accept emulator tokens. The API refuses to start with it unless `FIREBASE_PROJECT_ID` starts with `demo-` (`internal/config`).
  - **Web:** the build arg `VITE_FIREBASE_AUTH_EMULATOR_URL` connects the SDK to the emulator, and is likewise ignored unless the project id starts with `demo-`. A production build never sets either.
- Every test gets a **fresh user**: an emulator account with generated test credentials, added to the allowlist with the real CLI (`docker compose exec api /api user add …`). Tests share the stack but never each other's data.
- Tests drive the UI and check results through the API (`support/stack.ts` `Api`). They arrange data through the API too, where the UI isn't what's being tested.
- One worker. `resilience.spec.ts` stops the API container, so it is its own Playwright project that runs last.

## Gate coverage

| Gate item | Test |
| --- | --- |
| **Entry (#24)** | |
| Quick entry and batch entry without the mouse | `entry` · keyboard only |
| Merchant autocomplete reuses the existing merchant | `entry` · autocomplete |
| One bad row blocks the batch, flags the row, saves nothing | `entry` · bad row |
| 4.5, .99, 1,234.56, 19.99, 0.10 survive save, reload, edit | `entry` · round-trip |
| Expense dated today after 7 pm Eastern stays on today | `entry` · time zone (see below) |
| Several income entries, including a one-off under Other | `entry` · income |
| **Transactions (#25)** | |
| Open a past month | `transactions` · past month |
| Edit an amount; totals update without a reload | `transactions` · edit amount |
| Date moved into another month moves the entry | `transactions` · move date |
| Delete asks for confirmation | `transactions` · delete |
| Category filter works; category totals add up to the total | `transactions` · filter |
| **Refunds (#26)** | |
| Refund looks different from an expense | `refunds` · looks different |
| Refund linked to last month counts this month; the original shows its net | `refunds` · linked |
| Delete the original; the refund is kept, unlinked | `refunds` · delete original |
| **Across the whole app** | |
| Second allowlisted user (CLI) sees none of your data and gets defaults | `app` · second user |
| Non-allowlisted account sees "No access" | `app` · not allowlisted |
| API stopped: clear error, nothing looks saved | `resilience` |
| API restarted: earlier data still there | `resilience` |
| New screens in dark mode | `app` · dark mode (axe colour contrast + screenshots) |
| **Categories & sources (#23)** | |
| Reorder persists across a reload | `categories` · reorder |
| "Other" recolorable, not renamable or deletable | `categories` · Other (recolour via API, see below) |
| Deleting a category moves its expenses to Other | `categories` · delete |
| Source with entries: renamable, not deletable | `categories` · source |

### Where the automation differs from the manual checklist

- **Sign-in uses the auth emulator, not real Firebase.** The email-and-password flow and the backend's token check and allowlist are exercised for real. Google sign-in and the real project's configuration are not; check those by hand once on the deployed stack.
- **Time zone:** the browser runs in a zone whose calendar date differs from UTC's at the moment of the run (`Pacific/Pago_Pago` or `Pacific/Kiritimati`). That catches the same `new Date()` / `toISOString()` bug as "after 7 pm Eastern", at any hour.
- **Recolouring "Other"** is checked on the API because the Categories screen has no colour control yet.
- **Dark mode** is checked for theme, background and WCAG colour contrast, with screenshots attached to the report. Whether it *looks right* is still a human call.
- **The batch error** is caught by client validation before any request, so the API's all-or-nothing batch is covered by the backend tests, not here.
- **Not automatable:** entering the golden month by hand, and the "would you still use the spreadsheet?" usability judgement.

## Rules

- Generic fixtures only (root §9): no real names, employers or amounts.
- Generate test credentials in the test (`createAccount`); never use a real account.
- Keep a test per gate item, named after it, and update the table above when the gate changes.
- Don't add `waitForTimeout`; wait on a locator, response or URL.

# AGENTS.md — /e2e

Read the root `AGENTS.md` first. This folder is the end-to-end suite: Playwright driving the real Docker stack. It automates the **M1 testing gate**'s smoke checklist, the **M2 acceptance tests** (AT-1 to AT-24), the **M3 acceptance tests** (MS, RB, YS, ED) and the M6 security headers (#105).

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
  - **Proxy:** `FIREBASE_AUTH_EMULATOR_URL` adds the emulator's origin to the Content-Security-Policy's `connect-src` and `frame-src`. Only this stack sets it.
- Every test gets a **fresh user**: an emulator account with generated test credentials, added to the allowlist with the real CLI (`docker compose exec api /api user add …`). Tests share the stack but never each other's data.
- Tests drive the UI and check results through the API (`support/stack.ts` `Api`). They arrange data through the API too, where the UI isn't what's being tested.
- One worker. `security-headers.spec.ts` is its own Playwright project on full Chromium (below), so the smoke project keeps one worker throughout. `resilience.spec.ts` stops the API container, so it is its own project too, and runs after smoke.

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

### M2 acceptance tests (`templates.spec.ts`)

Each test builds the doc's "Test Month" fixture (6 expense items, 2 paychecks, days 1/15/29/30/31) for its own user, so the tests don't share months.

| AT | Test |
| --- | --- |
| AT-1 Create "Test Month"; totals match | `templates` · AT-1 (built through the editor) |
| AT-2 Day 0 / 32 rejected; 1 and 31 save | `templates` · AT-2 (form and API) |
| AT-3 85.5 round-trips as $85.50 | `templates` · AT-3 |
| AT-4 Merchant autocomplete, no duplicate | `templates` · AT-4 |
| AT-5 Rename and delete persist | `templates` · AT-5 |
| AT-6 Rebuild your own Example Month | **manual** (your real data) |
| AT-7 Empty month offers the template | `templates` · AT-7 |
| AT-8 Copy: 8 entries, fixture dates, totals | `templates` · AT-8 |
| AT-9 Tint, pill, banner | `templates` · AT-9 |
| AT-10 April 2027, Feb 2027, Feb 2028 clamping | `templates` · AT-10 |
| AT-11 Start blank; Edit template | `templates` · AT-11 |
| AT-12 After 7 pm Eastern | `templates` · AT-12 (off-UTC time zone, as M1) |
| AT-13 Edit confirms; total +$6.60 | `templates` · AT-13 |
| AT-14 Undo removes only unconfirmed copies | `templates` · AT-14 |
| AT-15 Confirm all; Undo removes nothing | `templates` · AT-15 (also the per-row Confirm) |
| AT-16 Reset confirmation; Cancel | `templates` · AT-16 |
| AT-17 Reset replaces the month; others untouched | `templates` · AT-17 |
| AT-18 Reset unlinks a refund elsewhere | `templates` · AT-18 + AT-19 |
| AT-19 Undo after reset | `templates` · AT-18 + AT-19 |
| AT-20 Save as template skips refunds | `templates` · AT-20 + AT-21 |
| AT-21 Day 31 lands on April 30 | `templates` · AT-20 + AT-21 |
| AT-22 Second user isolation | `templates` · AT-22 (UI and API, incl. 404 on another user's template) |
| AT-23 Source delete moves template items to Other | `templates` · AT-23 |
| AT-24 Dark mode | `templates` · AT-24 (axe colour contrast + screenshots) |

- **"Review in Transactions"** (AT-9) belongs to the Summary banner, which is M3 (#32). On Transactions the page is the review, so the test checks the button is absent there.

### M3 acceptance tests (`summaries.spec.ts`)

Each test seeds the doc's golden month (Dec 2026 to Mar 2027, generic names) for its own user through the API, then checks the Summary and Yearly screens. Expected figures are copied from the doc, not computed from the app.

| Doc ids | Test |
| --- | --- |
| MS-1, MS-2, MS-3 | `summaries` · January tiles, income per source, income modal |
| MS-4, MS-5, MS-6 | `summaries` · January spending, change vs. December, colours |
| MS-7, MS-8, MS-9 | `summaries` · Dec, Feb, Mar and the month switcher |
| MS-10, MS-11 | `summaries` · Bars/Donut; Back and Forward |
| RB-1, RB-2, RB-3 | `summaries` · refund month; delete and edit update Summary without a reload |
| YS-1 to YS-10 | `summaries` · yearly tiles, averages, table, charts and their text alternatives, row and bar navigation, 2026 / 2030, sum check |
| ED-1 to ED-6 | `summaries` · empty month, zero taxable, applied-template banner, time zone, phone width in dark mode, second user |

- **Percentages:** the app rounds to whole numbers (27%, +33%, −13%, −71%); the doc says one decimal. The tests assert the app's form. Tax rates are one decimal in both.
- **MS-7:** the doc expects no change figures for the first month; the app compares with an empty prior month and shows them. Not asserted.
- **Manual:** screen-reader use (YS-10) and whether dark mode looks right are still a human call.

### M6 security headers (`security-headers.spec.ts`, #105)

| Check | Test |
| --- | --- |
| Every header on `/`, an app route, `theme-init.js`, `/healthz` and `/v1/*` (signed in and out); no `Server` or `Via`; `no-store` on API responses; no inline `<script>` in the page | `security-headers` · every response |
| Email sign-in, the pre-paint theme, Google Fonts, every screen, menus and dialogs (including the scroll lock) with no CSP violations | `security-headers` · email sign-in and every screen |
| Google sign-in through the popup with no CSP violations: not allowlisted, then allowlisted | `security-headers` · Google popup |

- This spec is the `security` project, on **full Chromium** (`channel: "chromium"`), not Playwright's default headless shell. In the shell, an iframe created while a popup opens often never runs its scripts, so the SDK's auth iframe stalls and the popup can't return its result.
- The Google test waits for the emulator's account chooser to finish loading and for the SDK's auth iframe in the page, as a person picking an account naturally does.

### Where the automation differs from the manual checklist

- **Sign-in uses the auth emulator, not real Firebase.** The email-and-password flow and the backend's token check and allowlist are exercised for real. Google sign-in runs through the emulator's popup: the SDK loads the same Google script and opens the same kind of auth iframe, so the CSP is exercised, but Google's real account chooser is not. Check real Google sign-in, with no CSP errors in the console, and the real project's configuration by hand once on the deployed stack.
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

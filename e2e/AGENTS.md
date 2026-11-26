# AGENTS.md — /e2e

Read the root `AGENTS.md` first. This folder is the end-to-end suite: Playwright driving the real Docker stack. It automates the **M1 testing gate**'s smoke checklist, the **M2 acceptance tests** (AT-1 to AT-24), the **M3 acceptance tests** (MS, RB, YS, ED) the M6 security headers (#105) and request limits (#106), the **M8 import gate** (#100), the admin panel's **Users tab** (#157, #190), **username and password sign-in** (#182, #192), and the **accessibility pass** after the shadcn/ui migration (#179).

## Running it

```
cd e2e
npm ci
npx playwright install chromium
npm test                 # builds + starts compose.yml, runs every spec, removes the stack
```

- `E2E_KEEP_STACK=1 npm test` leaves the stack running afterwards.
- `npm run stack:up` once, then `E2E_SKIP_STACK=1 npx playwright test …` reruns specs against the running stack. `npm run stack:down` removes it, volume included.
- The stack is compose project `pp-e2e` on port 18443 (Caddy, `https://localhost:18443`), so it never touches the dev stack or its data.
- **Demo data to click around in:** `npm run seed` starts the stack if needed and adds one admin account, username `demo`, password `demo-password-123` (made up, for this local stack only; override with `SEED_USERNAME` / `SEED_PASSWORD`), with generic made-up data from January last year to today: expenses in every category, Saving, salary, freelance and one-off income, two linked refunds in January, a template applied to the current month (unconfirmed copies), and three saved trends. Sign in at `https://localhost:18443` (accept the local certificate). Running it again changes nothing; `npm run stack:down` and seed again to start over. It has its own config (`playwright.seed.config.ts`, `seed/`), so `npm test` never runs it, and the tests' own users never see its data.
- CI runs it as the `e2e` job (`.github/workflows/ci.yml`); a failure uploads the Playwright report with traces.

## How it works

- `compose.yml` uses the same API and web images and the same `deploy/Caddyfile` as the root `docker-compose.yml` (dev profile). There is no identity provider or emulator: the API checks the passwords itself (#182), so the suite signs in exactly as production does.
  - The only test-only settings are the raised `RATE_LIMIT_*` limits (below) and the `dbtool` service: a pinned Node image with the API's volume, under the `tools` profile so `up` never starts it. `ageSession` runs it (`docker compose run dbtool`) to move a session's start back 31 days, the one thing no route can do.
- Every test gets a **fresh user**: a generated username and test password, added with the real CLI (`docker compose exec -T api /api user add --username …`, password on stdin; `support/stack.ts` `createAccount`). Tests sign in through the real sign-in screen (`support/fixtures.ts` `signIn`), and the `Api` helper signs in with `POST /v1/auth/login`, so it holds its own session. Tests share the stack but never each other's data. `admin-users.spec.ts` is the exception: its admin comes from the CLI, and the users under test are added from the admin panel.
- Tests drive the UI and check results through the API (`support/stack.ts` `Api`). They arrange data through the API too, where the UI isn't what's being tested.
- One worker. `security-headers.spec.ts` is its own Playwright project, so the smoke project keeps one worker throughout. `resilience.spec.ts` stops the API container, so it is its own project too, and runs after smoke.

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
| Second user (CLI) sees none of your data and gets defaults | `app` · second user |
| API stopped: clear error, nothing looks saved | `resilience` |
| API restarted: earlier data still there | `resilience` |
| New screens in dark mode, including the sign-in screen with its error, the forced Change password screen and the account menu's Change password dialog | `app` · dark mode (axe WCAG A/AA + screenshots) |
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
| AT-24 Dark mode | `templates` · AT-24 (axe WCAG A/AA + screenshots) |

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
| Every header on `/`, an app route, `theme-init.js`, `/healthz` and `/v1/*` (signed in and out); no `Server` or `Via`; `no-store` on API responses; no inline `<script>` in the page; a policy with only our own origin and Google Fonts (no Google sign-in or Firebase origin) | `security-headers` · every response |
| Sign-in (a failed attempt, then the right password), the pre-paint theme, Google Fonts, every screen, menus and dialogs (including the scroll lock) with no CSP violations | `security-headers` · sign-in and every screen |

### M6 request limits (`request-limits.spec.ts`, #106)

| Check | Test |
| --- | --- |
| A 2 MB body gets the API's `413 request_too_large`; a 13 MB one is refused too (by the API or the proxy's backstop) | `request-limits` · oversized body |
| The sixth export in a row gets `429 rate_limited` with `Retry-After` and `no-store`; other routes still answer | `request-limits` · expensive route |

- Every test reaches the API from the same Docker network address, one after another, which no real client does. So `compose.yml` raises the per-IP and per-user limits (`RATE_LIMIT_PER_IP`, `RATE_LIMIT_PER_USER`), and the 429 is checked on the expensive-route limit, which keeps its production value. The backend tests cover the per-IP and per-user buckets. The `Api` helper also waits out `Retry-After` on a 429 (`once` doesn't).

### M8 import (`import.spec.ts`, #100)

Fixture workbooks are built in the test with `exceljs` (`support/workbooks.ts`) from generic data, in the import template's layout. Every test has its own user, so months never overlap between tests.

| Gate item | Test |
| --- | --- |
| Template downloads as a workbook with the Expenses and Income sheets and the documented columns | `import` · IM-1 |
| Upload: the review shows the right counts and date range, one problem group per issue code with sheet and row, and the existing-months warning; nothing is saved | `import` · IM-1 |
| Import valid rows only: skipped rows are absent, imported ones are confirmed; Yearly and Summary show the imported month | `import` · IM-2 |
| The banner appears on another screen while the import runs, then turns to finished and can be dismissed | `import` · IM-3 |
| Cancel mid-run removes everything the import added | `import` · IM-4 |
| Undo removes the batch but keeps a hand-added entry in the same month | `import` · IM-5 |
| Import page and review in dark mode (axe WCAG A/AA + screenshots) | `import` · IM-6 |

- **Timing:** the import writes 200 rows per batch, so a small file finishes instantly. IM-3 and IM-4 use a 49,000-row file (just under the 50,000-row limit) with a unique merchant and a long note on every row, which keeps the import running for about four seconds, long enough to see the banner and press Cancel. The banner only follows an import it saw running, so a tiny file would never show it.
- **`exceljs` is loaded with Node's `require`** (`createRequire`), because Playwright's module loader cannot load its dependency tree.
- **Not automated:** the Mac import screens, an import interrupted by a server restart (the backend tests cover recovery), and opening the downloaded problem-rows file in Excel.

### Accessibility (`a11y.spec.ts`, #179)

Every axe check in the suite goes through `support/a11y.ts`: all WCAG 2.0, 2.1 and 2.2 A and AA rules (not only colour contrast), after the page's enter animations have finished, with a full-page screenshot attached.

| Check | Test |
| --- | --- |
| Every screen (Summary with bars and donut, Add entries, Transactions, Yearly, Trends both tabs, Templates, Categories, Import, Export, Settings, Admin both tabs, Page not found) and the sign-in screen with its error pass axe, in light and in dark | `a11y` · every screen passes axe |
| The income modal, account menu, edit dialog, delete confirmation, a toast, the merchant suggestions and the Add user dialog pass axe, in light and in dark | `a11y` · dialogs, menus, the combobox and toasts |
| Every Tab stop on every screen draws a focus ring (outline or the 3px ring) | `a11y` · keyboard only · focus ring |
| The account menu, a dialog (focus trapped, returned to its trigger), the merchant combobox, the Bars / Donut toggle and the sidebar links work with the keyboard alone | `a11y` · keyboard only · menus and dialogs |
| Controls are at least 44×44px; inside a dense table (the batch entry rows, row buttons) at least 24px (WCAG 2.2); a control's label counts towards its target, links inside a sentence don't count | `a11y` · touch targets |
| Nothing scrolls sideways at 640px (1280px at 200% zoom) or 375px; at phone width the sidebar is a sheet that opens, closes with Esc (focus back on its trigger) and closes onto the picked page's heading | `a11y` · reflow |
| With reduced motion asked for, dialogs, the menu and the sidebar sheet don't animate | `a11y` · reduced motion |

- **Colour is never the only signal:** refunds, unconfirmed rows and change indicators are checked where they are tested (`refunds` · looks different, `templates` · AT-9, `summaries` · MS-6); axe covers the rest.
- **The account menu skips one rule, `aria-hidden-focus`.** Radix's modal menu marks the rest of the page `aria-hidden` while its links stay focusable, but they can't be reached: focus is trapped in the menu and a click outside only closes it. A non-modal menu would pass, but made the menu's unit tests flaky, so it stays modal.
- **Manual:** whether each screen matches the V2 canvas (the differences are listed on #179), and screen-reader use.

### Sign-in (`auth.spec.ts`, #192)

| Check | Test |
| --- | --- |
| The sign-in screen has no Google button and no reset email, only the "ask an admin" note; a wrong password and an unknown username show the same "Wrong username or password" error, and the API answers both with the same `401 invalid_credentials`; usernames are case-insensitive | `auth` · generic error |
| A user added with `--must-change` sees only "Choose a new password" (other routes and the API's `403 password_change_required` until then); the checklist and a wrong temporary password are refused; after the change the old token and password stop working | `auth` · forced change |
| Signing out ends that session only | `auth` · sign out |
| Changing your password from the account menu keeps this device signed in and signs out your other browser and API sessions; only the new password works | `auth` · change password |
| A session older than 30 days gets `401 session_expired`; the app drops the token and says "Your session has expired" | `auth` · session expiry |
| 10 wrong passwords in a row lock the username (`429 rate_limited`, a long `Retry-After`, "Too many attempts" on the screen), even for the right password; other usernames still sign in | `auth` · lock-out |

- **Session expiry** ages the session in the database (`ageSession`, through `dbtool`) while the API runs. The hourly sweep that deletes old sessions could in theory run between the edit and the request; it runs once at start-up and then hourly, so in practice it doesn't.
- **The lock-out** is checked rather than the per-username rate (8 attempts, then one per 12 s), because `compose.yml` raises that rate with `RATE_LIMIT_LOGIN` for the rest of the suite. The lock-out keeps its production values, so the test uses its own user. The backend tests cover the rate itself.

### Admin panel · Users tab (`admin-users.spec.ts`, #157, #190)

| Check | Test |
| --- | --- |
| A username that isn't a user can't sign in; an admin adds it with an initial password ("choose their own" on by default); the sign-in details show once; the row appears without the password; that person signs in, must choose a password, and finds an empty account with the eight default categories and the "Other" income source and no admin rights | `admin-users` · admin adds a user |
| With "choose their own" unchecked, the person signs straight in with the initial password | `admin-users` · no forced change |
| A taken username (in any case) shows "That username is already taken." in the dialog, which stays open; nothing is added and their password is untouched | `admin-users` · taken username |
| Reset password with a generated password: the details show once, the person's browser and API sessions stop working ("Your session has expired"), the old password is refused and the new one leads to Choose a new password | `admin-users` · reset password |
| A member has no "Admin dashboard" menu item, gets "Page not found" at `/admin`, and `GET` and `POST /v1/admin/users` answer `403` (nothing is added) | `admin-users` · member |

- **The first admin still comes from the CLI** (`createAccount("admin", { role: "admin" })`), as on a real deployment. Each test has its own admin, so the limit on `POST /v1/admin/users` (burst 5 per user) is never reached.
- The added person signs in in a second browser context, so the admin's session stays open alongside it.

### Where the automation differs from the manual checklist

- **Sign-in is the real thing**, with test-generated passwords. What stays manual: signing in on the deployed tailnet host (its `ts.net` certificate and HSTS, `docs/tailscale.md`), the Mac app's sign-in and Keychain, and the copy button in the sign-in details (the browser's clipboard permission).
- **Time zone:** the browser runs in a zone whose calendar date differs from UTC's at the moment of the run (`Pacific/Pago_Pago` or `Pacific/Kiritimati`). That catches the same `new Date()` / `toISOString()` bug as "after 7 pm Eastern", at any hour.
- **Recolouring "Other"** is checked on the API because the Categories screen has no colour control yet.
- **Dark mode** is checked for theme, background and every WCAG A/AA axe rule, with screenshots attached to the report. Whether it *looks right* is still a human call.
- **The batch error** is caught by client validation before any request, so the API's all-or-nothing batch is covered by the backend tests, not here.
- **Not automatable:** entering the golden month by hand, and the "would you still use the spreadsheet?" usability judgement.

## Rules

- Generic fixtures only (root §9): no real names, employers or amounts.
- Generate test credentials in the test (`createAccount`, `newPassword`); never use a real account or password.
- Keep a test per gate item, named after it, and update the table above when the gate changes.
- Don't add `waitForTimeout`; wait on a locator, response or URL.

# AGENTS.md — /mac

Read the root `AGENTS.md` first. This file adds rules specific to the native macOS app.

## Stack

- SwiftUI, **Swift 6** language mode (complete strict concurrency checking), async/await
- Talks only to the backend API described in `/api`. Keep the networking layer in one place and model types to match the spec.
  - **Client: `swift-openapi-generator`'s build plugin**, run on every build from `Services/API/openapi.yaml` (a symlink to `/api/openapi.yaml`) and `openapi-generator-config.yaml`. Nothing generated is committed. Tuist keeps non-Swift files out of a target's sources, so those two files join the target as resources, which is how the plugin finds them.
  - `Services/API/APIClient.swift` wraps the generated `Client` with `AuthMiddleware` (bearer token, one retry after a refresh, session errors) and `ErrorMiddleware` (every 4xx/5xx becomes an `APIError` with the server's `code`, `message` and `details`), and maps responses to app types in `Models/`. View models depend on the `CategoriesAPI`, `EntriesAPI` and `TemplatesAPI` protocols (`LedgerAPI` is all three), never on generated types.
- Auth is Firebase Authentication via its Apple-platform SDK, behind `AuthService`. `Services/Auth/FirebaseAuthService.swift` is the only file that imports `FirebaseAuth`, `FirebaseCore` or `GoogleSignIn`.
  - Google sign-in uses the `GoogleSignIn` SDK for the Google ID token, then signs in to Firebase with it.
  - `SessionService` mirrors the web session: restoring, signed out (with a "no access" or "expired" notice), loading the account from `/v1/me`, signed in.
- **Minimum macOS 26** (deployment target `26.0`; root `AGENTS.md` §10). Use current SwiftUI, Swift Charts and Observation APIs directly. Add an `#available` check only for an API newer than macOS 26.
- **Project: Tuist.** `Project.swift` in this folder defines the app and test targets, packages, build settings, Info.plist keys and entitlements. Run `tuist generate` to create the Xcode project; the generated `.xcodeproj`/`.xcworkspace` are gitignored. The Tuist version is pinned in `.mise.toml` (`mise install`).
  - Packages use Xcode's own package integration (`packages:` in `Project.swift`). Tuist keeps the resolved versions in `.package.resolved`, which is committed.
- **Config:** `Config/App.xcconfig` (committed defaults) includes the gitignored `Config/Local.xcconfig`, which holds the server address, the Firebase Apple app's values, the Google client id and your `DEVELOPMENT_TEAM`. Copy `Config/Local.example.xcconfig` to start. The values reach the app through Info.plist keys, and `Models/AppConfig.swift` checks them at launch: the server must be `https` (plain `http` only for `localhost`), and the Auth emulator is allowed only for a `demo-` project. A bad config shows a setup screen.

## Rules

- **Money** is integer cents (`Int`). Format for display in one shared helper; never use `Double` for amounts.
- **Dates** are `YYYY-MM-DD` calendar dates; do not let time zones shift them.
- **Online-only in v1:** no local persistence of financial data. When offline or a request fails, show an error and block add/edit. (A cached read-only mode is planned later; do not build it now.) UI preferences (appearance, sidebar state) may be stored in `UserDefaults`/`@AppStorage`.
- **Secrets:** auth tokens live only in the Keychain. The Firebase and Google SDKs put them there (the data-protection Keychain, so the app is signed with a team and a keychain access group); app code never stores or caches one. Never log amounts, merchants, notes, or tokens.
- Follow the **Architecture** section below: logic lives in view models, networking in `Services/API`, and every user-facing string in the string catalog.
- Never edit the generated Xcode project, in Xcode or by hand: `tuist generate` overwrites it. New source files go in the target's folder (the manifest globs it); every other project change goes in `Project.swift`, then regenerate.

## Architecture

Source lives in `PennyPincher/Sources/` (paths below are relative to it):

```
App/        the @main app, AppContainer (builds services and long-lived view models), menu commands
Services/   every service, one folder each: API, Auth, Session, Appearance, …
Models/     types shared across screens and services (Account, AppConfig, Appearance, …)
Shared/     helpers and views used by several screens: Money, Theme, View/Components
Screens/<Screen>/
  Model/              that screen's own types (modes, fields, sidebar items, display info)
  ViewModel/          <Screen>ViewModel: state, derived text, actions; as much logic as possible
  View/<Screen>View.swift                   layout only: composes components, no functional code
  View/Extensions/<Screen>View+Extension.swift   the view's actions (forward to the view model)
  View/Components/    one view struct per file
  View/Previews/<Screen>View+Previews.swift   #Preview for each state of the screen
```

- **Services** go only in `Services/`. View models and other services use them; views never call one directly.
- **View models** are `@MainActor @Observable` classes. Put state, derived values (titles, messages, enabled states) and actions there, so they can be unit-tested. Inject what they need (services, `UserDefaults`, URL opening) through `init`.
- **Screen views** contain only layout: composition, modifiers, bindings, and references to their extension's methods (`action: signIn`). No `Task`, no logic, no inline closures that do work. A `@FocusState` or other SwiftUI-only state may be declared in the view and changed from its extension.
- **The extension file** holds the view's functional code: button actions, submit and appear handlers. Each method is a thin forward to the view model, plus SwiftUI-only work such as moving focus. A view without functional code needs no extension file.
- **Components** are atomic: every `View` struct is its own file in `View/Components`, and there are no `@ViewBuilder` helper properties or functions; make a component instead. Components take data, bindings and action closures (or read a view model for display), and never contain functional code themselves. A component used by several screens goes in `Shared/View/Components`.
- One type per file outside `Models/` and `Services/` too (models may nest small types such as an enum of cases).
- **Strings:** every user-facing string is in `Resources/Localizable.xcstrings`, with Info.plist names in `Resources/InfoPlist.xcstrings`. Use semantic keys (`signIn.title`, `account.signedIn %@`) with the English text as the catalog value, never English literals in code. Views pass keys as `LocalizedStringKey`; view models and services use `LocalizedStringResource` or `String(localized:)`. Interpolated keys use format specifiers (`%@`, positional `%1$@` in the value). The build extracts every key into the catalog, so a new key shows up there as needing a value.
- **Previews:** every screen has `#Preview`s in `View/Previews/<Screen>View+Previews.swift`, one per meaningful state (for example sign-in, an error, reset, sent; loading, signed out, signed in; light and dark). They build their view models from `Shared/Preview/PreviewData.swift`, which uses preview-only fakes (`PreviewAuthService`, `PreviewAccountAPI`) in `Services/`. All of this code, previews included, is wrapped in `#if DEBUG`, so none of it ships in a release build. Use generic made-up data only.
- **Tests: Swift Testing** (`import Testing`, `@Suite`, `@Test`, `#expect`, `#require`, `arguments:` for tables of cases) for every test except UI tests, which use XCTest/XCUITest. A suite that needs main-actor state is a `@MainActor struct` that builds it in `init`. Disable environment-dependent suites with an `.enabled(if:)` trait, not by skipping inside the test. Tests mirror the layout under `PennyPincherTests/` (`Models`, `Services`, `Shared`, `Screens`, with fakes and fixtures in `Support`).

## Design reference

The approved screens are in the **Penny-Pincher Screens** design canvas (private, owner access only):
https://claude.ai/code/artifact/420ff31e-17a4-4f1d-b07d-9d958efeab9c

The canvas shows the web app. The Mac app matches its **behavior, content, data and colour meanings** but uses native macOS controls and layout. `/web/AGENTS.md` describes every screen in detail; read it alongside this file. Canvas numbers and names are mock data; never copy them into code, seeds or tests.

## Look and feel

- Use the **system font** (SF Pro) and native controls rather than recreating the web styling. Use monospaced digits (`.monospacedDigit()`) for every money column.
- Support Light, Dark and System appearance. Define the brand colours as named colours in the asset catalog with light and dark variants, matching the web tokens:

| Asset colour | Light | Dark | Used for |
|---|---|---|---|
| `Primary` | `#1F5FD6` | `#2F6BE0` | prominent buttons, selection |
| `Brand` | `#F97316` | `#F97316` | app icon/logo, trend bars, unconfirmed dot |
| `Income` | `#15803D` | `#5BD68A` | net income figures |
| `Saving` | `#1F5FD6` | `#3D78EA` | Saving bars and figures |
| `Spent` | `#475569` | `#8C9AB0` | spent bars, ordinary category bars |
| `Refund` | `#166534` text on `#F0FDF4` | `#6EE7A0` text on `#0F2A1C` | refund rows and amounts |
| `Unconfirmed` | `#9A3412` text on `#FFF7ED` | `#FDBA74` text on `#2B1D12` | template copies not yet confirmed |

- Prefer system semantic colours (`.primary`, `.secondary`, window and control backgrounds) for everything else.
- **Change indicators** (month over month, year over year): orange = worse (spent more), blue = better (spent less). For **Saving the colours flip**, so saving more is blue. Always pair the colour with an arrow (▲/▼ or SF Symbols `arrow.up`/`arrow.down`) and a +/− sign.
- Icons: SF Symbols. No emoji.

## Window, sidebar and menus

- Main window uses `NavigationSplitView`. Sidebar items in this order: Summary, Add entries, Transactions, Yearly, Trends, Templates, Categories & sources, Import.
- The sidebar is **collapsible** with the standard toolbar sidebar button and ⌃⌘S. Remember its state.
- Account: the signed-in user's name/avatar sits in the sidebar footer and opens a menu with Settings, Import transactions, Export data and Sign out. Appearance (Light / Dark / System) lives in the **Settings window (⌘,)**.
- **Admin dashboard is web-only.** For admins, the account menu item opens the web admin page in the default browser.
- Use the menu bar for common commands: File ▸ New Expense (⌘N, opens Add entries on a blank row) and View ▸ Previous/Next Month (⌘[ and ⌘]; ⌘←/⌘→ would steal cursor movement in text fields). The month commands work on the screens that show a month (Summary, Add entries and Transactions, which share it).

## Screens (native mapping)

Behavior for each screen is defined in `/web/AGENTS.md`. Native equivalents:

- **Sign in:** a dedicated window or sheet shown before the main window. It offers Sign in with Google, email and password, and "Forgot password?" which sends a reset email. Show an inline error for wrong credentials and a progress indicator while restoring a session. No sign-up; explain that an admin creates accounts.
- **Summary:**
  - Four figures: net income, spent, saved & invested, left over.
  - Clicking an income source opens a **sheet or popover** with that month's entries and an "All sources combined" total.
  - Category spending uses Swift Charts ranked bars with a Bars/Donut segmented control. Selecting a category only highlights its row.
  - Shows an unconfirmed banner when template copies need a look.
  - As built (`Screens/Summary`): reads `GET /v1/summaries/monthly/{month}` through `SummariesAPI` and shares the month with Add entries and Transactions. Percent of income (of combined net) and every change come from the client (`Shared/Change`: `Change`, `ChangeTone`, which flips for Saving). Ranked bars are `Shared/View/Components/RankedBarsChart` (a tap only highlights; categories netting to zero or below get no bar); the donut and its legend are components of the screen. Changes show orange (worse) or blue (better) with ▲/▼ and a +/− sign. The banner is the shared `UnconfirmedBanner` (Review opens Transactions narrowed to unconfirmed entries). An empty month shows the shared `NewMonthOffer`. The welcome checklist shows only on the current month while it is empty; its "categories checked" step and Hide are kept in `UserDefaults` (a per-person convenience), the template step comes from the templates list and the entry step from the month having entries.
- **Add entries:** keyboard-first single entry plus a batch table. Return adds a row; Tab moves between fields. Merchant field autocompletes from past merchants. Supports adding a refund linked to an original expense.
- **Transactions:**
  - Use SwiftUI `Table` with sortable columns.
  - Category filter chips (or a picker) plus search over merchant and note.
  - Unconfirmed rows: orange tint, an "Unconfirmed" label and Confirm / Confirm All.
- **Refunds:**
  - Rows show a negative amount in the refund colour and a "Refund for …" link to the original.
  - Tags: Full refund, Partial refund, From <Month>, or Not linked.
  - Originals show "Refunded in full" (amount struck through) or "Partly refunded · net …".
  - "Link…" opens a sheet with search and a suggested match.
- **Templates:** list plus editor. Expense items take name, category, amount and day of month; income items take source, label, gross, gross taxable and net. Apply to a chosen month; the backend moves days 29–31 to the month's last day when needed.
  - Items are added and edited in sheets. "Apply…" opens a sheet with a month switcher; a month with data asks for the full-reset confirmation before it retries with `reset_month`. The new-month offer, Apply, the reset dialog and Undo are one shared `MonthTemplatesViewModel` (`Shared/Templates`), used by Transactions and the Apply sheet. The banner's Review narrows Transactions to unconfirmed entries; Undo shows only while the newest apply has unconfirmed copies.
- **Yearly:**
  - Income vs. spent paired bars per month (Swift Charts). Clicking a month opens its Summary.
  - Ranked bars of monthly category averages.
  - Month-by-month table.
  - As built (`Screens/Yearly`): reads `GET /v1/summaries/yearly/{year}`; the year switcher is the toolbar's own state (default: the current year). Tile averages and the average row are `total ÷ average_month_count` in integer cents, rounded half away from zero (`YearlyViewModel.averageCents`). Choosing a chart pair or a table row calls `openMonth`, which the window turns into that month's Summary. Months without entries show "—".
- **Trends:** a segmented control switches Custom trends and By category.
  - **Custom:** saved trends list, an Amount/Count toggle, summary figures, bars per month (selecting a bar lists its entries) and a New Trend sheet (match by merchant, category or note text; measure).
  - **By category:** category picker, figures vs. last month and vs. the same month last year, paired this-year/last-year bars, biggest movers, and the month-by-month change table.
- **Categories & sources:**
  - Reorder with drag; rename inline.
  - Delete with a confirmation stating how many entries move to Other.
  - Other can never be renamed, edited or deleted, so show it locked with no actions. Saving is badged "Counted as savings".
  - Income sources show entries, gross, net and tax rate. Every source except "Other" can be renamed. Delete is available only for a source with no entries (its template items move to "Other"); a source with entries can only be renamed.
- **Import (Excel):** same stages and rules as web (`/web/AGENTS.md`, Import). "Download template" saves with an `NSSavePanel`; upload uses `.fileImporter` (or a drop target) limited to `.xlsx`. Review uses a `Table` for the By year rows and grouped problem lists. Progress reads the SSE stream with `URLSession.bytes(for:)` and shows a `ProgressView`; while it runs, show a progress bar at the top of the main window's detail area, and post a user notification when it finishes if the app is in the background. Cancel and Undo use confirmation dialogs.
- **Empty states** (use `ContentUnavailableView`):
  - **New account:** a welcome checklist (categories, template, first entry).
  - **New month:** offers to copy the template, with a preview of its items and totals and Start blank as the alternative. After copying, show a banner with Review and Undo.

Use `.confirmationDialog`/alerts for destructive actions, sheets for multi-field tasks, and a brief inline status message for background confirmations.

## Running it

```
cd mac
mise install                          # the pinned Tuist
cp Config/Local.example.xcconfig Config/Local.xcconfig   # then fill it in
tuist generate                        # creates and opens PennyPincher.xcworkspace
```

- Xcode asks once to **trust the OpenAPIGenerator plugin** ("Trust & Enable"). On the command line, pass `-skipPackagePluginValidation`.
- Build and test from the command line:

  ```
  xcodebuild test -workspace PennyPincher.xcworkspace -scheme PennyPincher \
    -destination 'platform=macOS' -skipPackagePluginValidation -allowProvisioningUpdates
  ```

  Unit tests don't need signing (add `CODE_SIGNING_ALLOWED=NO`). Running the app does: Firebase needs the keychain access group, so set `DEVELOPMENT_TEAM`.
- **Signing in locally without a Firebase project:** use the e2e Auth emulator (`npm run stack:up` in `/e2e`, port 19099) and run the API on this Mac against it:

  ```
  cd backend && go build -o /tmp/pp-api ./cmd/api
  PORT=8080 DB_PATH=/tmp/pp-dev.db FIREBASE_PROJECT_ID=demo-penny-pincher \
    FIREBASE_AUTH_EMULATOR_HOST=localhost:19099 /tmp/pp-api
  ```

  Then use the emulator block at the bottom of `Local.example.xcconfig`. `npm run seed` in `/e2e` creates the emulator account in `e2e/AGENTS.md`; allowlist it on your API with `/tmp/pp-api user add --uid <its uid> --email <its email> --role admin` (same environment variables). Google sign-in is hidden with the emulator.
- `EmulatorSignInTests` signs in for real against that setup. Its suite is disabled unless `TEST_RUNNER_PP_EMULATOR_HOST`, `TEST_RUNNER_PP_SERVER_URL`, `TEST_RUNNER_PP_TEST_EMAIL` and `TEST_RUNNER_PP_TEST_PASSWORD` are set on the `xcodebuild test` command.

## Quality

- Unit-test view models, money formatting, and change-indicator colour logic (including the Saving flip) with Swift Testing.
- Check both appearances and Full Keyboard Access; every control needs an accessibility label.
- Run `tuist generate`, then build and run the tests with `xcodebuild` (or `tuist test`) before finishing.

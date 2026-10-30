# AGENTS.md — /mac

Read the root `AGENTS.md` first. This file adds rules specific to the native macOS app.

## Stack

- SwiftUI, Swift concurrency (async/await)
- Talks only to the backend API described in `/api`. Keep the networking layer in one place and model types to match the spec.
- Auth is Firebase Authentication via its Apple-platform SDK; keep it behind a small wrapper. Minimum macOS version is an open decision (see root file).

## Rules

- **Money** is integer cents (`Int`). Format for display in one shared helper; never use `Double` for amounts.
- **Dates** are `YYYY-MM-DD` calendar dates; do not let time zones shift them.
- **Online-only in v1:** no local persistence of financial data. When offline or a request fails, show an error and block add/edit. (A cached read-only mode is planned later; do not build it now.) UI preferences (appearance, sidebar state) may be stored in `UserDefaults`/`@AppStorage`.
- **Secrets:** store auth tokens in the Keychain. Never log amounts, merchants, notes, or tokens.
- Keep views thin: logic lives in view models; networking lives in the API client.
- Avoid hand-editing `project.pbxproj`; prefer adding files through Xcode or a project generator if one is adopted.

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

- Main window uses `NavigationSplitView`. Sidebar items in this order: Summary, Add entries, Transactions, Yearly, Trends, Templates, Categories & sources.
- The sidebar is **collapsible** with the standard toolbar sidebar button and ⌃⌘S. Remember its state.
- Account: the signed-in user's name/avatar sits in the sidebar footer and opens a menu with Settings, Export data and Sign out. Appearance (Light / Dark / System) lives in the **Settings window (⌘,)**.
- **Admin dashboard is web-only.** For admins, the account menu item opens the web admin page in the default browser.
- Use the menu bar for common commands, such as File ▸ New Expense (⌘N) and View ▸ Previous/Next Month.

## Screens (native mapping)

Behavior for each screen is defined in `/web/AGENTS.md`. Native equivalents:

- **Sign in:** a dedicated window or sheet shown before the main window. It offers Sign in with Google, email and password, and "Forgot password?" which sends a reset email. Show an inline error for wrong credentials and a progress indicator while restoring a session. No sign-up; explain that an admin creates accounts.
- **Summary:**
  - Four figures: net income, spent, saved & invested, left over.
  - Clicking an income source opens a **sheet or popover** with that month's entries and an "All sources combined" total.
  - Category spending uses Swift Charts ranked bars with a Bars/Donut segmented control. Selecting a category only highlights its row.
  - Shows an unconfirmed banner when template copies need a look.
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
- **Yearly:**
  - Income vs. spent paired bars per month (Swift Charts). Clicking a month opens its Summary.
  - Ranked bars of monthly category averages.
  - Month-by-month table.
- **Trends:** a segmented control switches Custom trends and By category.
  - **Custom:** saved trends list, an Amount/Count toggle, summary figures, bars per month (selecting a bar lists its entries) and a New Trend sheet (match by merchant, category or note text; measure).
  - **By category:** category picker, figures vs. last month and vs. the same month last year, paired this-year/last-year bars, biggest movers, and the month-by-month change table.
- **Categories & sources:**
  - Reorder with drag; rename inline.
  - Delete with a confirmation stating how many entries move to Other.
  - Other can never be renamed, edited or deleted, so show it locked with no actions. Saving is badged "Counted as savings".
  - Income sources show entries, gross, net and tax rate. Every source except "Other" can be renamed. Delete is available only for a source with no entries (its template items move to "Other"); a source with entries can only be renamed.
- **Empty states** (use `ContentUnavailableView` where available):
  - **New account:** a welcome checklist (categories, template, first entry).
  - **New month:** offers to copy the template, with a preview of its items and totals and Start blank as the alternative. After copying, show a banner with Review and Undo.

Use `.confirmationDialog`/alerts for destructive actions, sheets for multi-field tasks, and a brief inline status message for background confirmations.

## Quality

- Unit-test view models, money formatting, and change-indicator colour logic (including the Saving flip) with XCTest.
- Check both appearances and Full Keyboard Access; every control needs an accessibility label.
- Build with `xcodebuild` and run tests before finishing.

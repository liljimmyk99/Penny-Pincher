# AGENTS.md — /mac

Read the root `AGENTS.md` first. This file adds rules specific to the native macOS app.

## Stack

- SwiftUI, Swift concurrency (async/await)
- Talks only to the backend API described in `/api`. Keep the networking layer in one place and model types to match the spec.
- Auth is Firebase Authentication via its Apple-platform SDK; keep it behind a small wrapper. Minimum macOS version is an open decision (see root file).

## Rules

- **Money** is integer cents (`Int`). Format for display in one shared helper; never use `Double` for amounts.
- **Dates** are `YYYY-MM-DD` calendar dates; do not let time zones shift them.
- **Online-only in v1:** no local persistence of financial data. When offline or a request fails, show an error and block add/edit. (A cached read-only mode is planned later; do not build it now.)
- **Secrets:** store auth tokens in the Keychain. Never log amounts, merchants, notes, or tokens.
- Keep views thin: logic lives in view models; networking lives in the API client.
- Avoid hand-editing `project.pbxproj`; prefer adding files through Xcode or a project generator if one is adopted.

## Required UI behavior

Match the web app's behavior (see `/web/AGENTS.md`) using native macOS conventions:

- Landing view for the current month: income total per source (clicking one opens a sheet/popover listing that month's income entries) and spending total per category (selecting a category only highlights the row).
- Details view of all expenses for the month.
- Refunds styled distinctly; unconfirmed template-copied items clearly flagged.
- Merchant autocomplete; quick entry of one or many expenses, with keyboard-friendly forms.
- Custom trends with native charts (Swift Charts is a good fit).

## Quality

- Unit-test view models and money formatting with XCTest.
- Build with `xcodebuild` and run tests before finishing.

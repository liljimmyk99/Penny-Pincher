# AGENTS.md — /web

Read the root `AGENTS.md` first. This file adds rules specific to the React web app.

## Stack

- React (TypeScript recommended)
- Talks only to the backend API described in `/api`. Generate the API client/types from the OpenAPI spec rather than hand-writing them.
- Auth uses the Firebase JS SDK. UI library and charting library are open decisions (see root file). Do not add a major dependency without noting it there.

## Rules

- **Money** arrives as integer cents. Convert to display strings in one shared formatting utility; never do arithmetic on floats or on formatted strings.
- **Dates** are `YYYY-MM-DD` calendar dates. Do not let time zones shift them.
- **Online-only in v1:** no offline cache and no storing financial data in localStorage/sessionStorage. Show a clear error when a request fails. (UI preferences such as theme and sidebar state may be stored locally.)
- Keep server state in a data-fetching layer (e.g. TanStack Query or equivalent), not copied into component state.
- Auth is Firebase Authentication; keep the SDK behind a small wrapper module so the rest of the app never imports it directly.

## Design reference

The approved screens live in the **Penny-Pincher Screens** design canvas (private, owner access only):
https://claude.ai/code/artifact/420ff31e-17a4-4f1d-b07d-9d958efeab9c

Every screen exists in light and dark. Sample numbers and names on the canvas are mock data; never copy them into code, seeds or tests. When this file and the canvas disagree, this file wins; flag the difference.

## Design system

Define these as tokens (CSS custom properties or the UI library's theme) in one place. Do not scatter hex values through components.

**Type:** Manrope (400–800) from Google Fonts, system sans-serif fallback. Tabular numerals for every money column.
- Page title 32px/800 · section title 18px/800 · body 14px · tile value 26px/800
- Eyebrow labels: 12px/800, uppercase, 0.06em letter-spacing

**Shape and spacing:** cards radius 14px with a 1px border; buttons and inputs radius 10px, 44px tall; chips and pills fully rounded. Page padding 32px top, ~40px sides; 24px between sections, 16px between tiles. Touch targets at least 44px.

**Colors (light / dark):**

| Token | Light | Dark | Used for |
|---|---|---|---|
| background | `#F2F4F7` | `#0D1524` | page |
| surface | `#FFFFFF` | `#141D2E` | cards, menus, dialogs |
| border | `#E3E7ED` | `#233047` | card borders, dividers |
| text | `#111827` | `#E8EDF5` | primary text |
| text-muted | `#4B5563` | `#A3AEC0` | labels, secondary text |
| sidebar | `#0E1A2B` | `#070C16` | left navigation |
| primary (blue) | `#1F5FD6` | `#2F6BE0` | primary buttons, selection, focus |
| brand (orange) | `#F97316` | `#F97316` | logo, trend bars, unconfirmed dot |
| income (green) | `#15803D` | `#5BD68A` | net income figures |
| saving (blue) | `#1E40AF` text, `#1F5FD6` bars | `#A9C4FF` text, `#3D78EA` bars | Saving everywhere |
| spent (slate) | `#475569` | `#8C9AB0` | spent bars, ordinary category bars |
| refund | row `#F0FDF4`, text `#166534` | row `#0F2A1C`, text `#6EE7A0` | refund rows and amounts |
| unconfirmed | tint `#FFF7ED`, pill `#FFEDD5`, text `#9A3412` | tint `#2B1D12`, pill `#4A2A10`, text `#FDBA74` | template copies not yet confirmed |
| danger | `#B91C1C` | `#DC2626` | destructive buttons |

- Orange, blue and green are the action/accent colors; white is an accent only, never a primary color.
- Text must meet 4.5:1 contrast (3:1 for large text). Colors that must be told apart also differ in lightness, not hue alone.

**Change indicators (month over month, year over year):** colour by meaning, not direction. Orange = worse (spent more), blue = better (spent less). For **Saving the colours flip**: saving more is blue (good), saving less is orange. Always show an ▲/▼ arrow and a +/− sign too, so colour is never the only signal.

**Icons:** simple 2px-stroke line icons (24px grid, shown at 18px). No emoji.

**Theme:** Light, Dark and System, chosen in the account menu. Default to System.

## Layout and navigation

- Left sidebar, 232px wide, dark background. Items in this order: Summary, Add entries, Transactions, Yearly, Trends, Templates, Categories & sources. The current page is highlighted (white pill) and marked `aria-current="page"`.
- **Collapsible sidebar:** a chevron button next to the logo collapses it to a ~76px icon-only rail (logo, icons, avatar) and the content widens. Links keep their accessible names when collapsed. Remember the choice per user (a UI preference, safe to store locally).
- Account button at the bottom of the sidebar opens a menu: name and email, Appearance (Light / Dark / System), Settings (⌘,), Export data, Admin dashboard (admins only), Sign out.
- Main content is fluid; cards and tables wrap or scroll horizontally inside their card on narrow windows. No horizontal page scroll.

## Screens

### Sign in and splash
- Split layout: brand panel left, sign-in card right.
- Continue with Google, plus email and password with a show/hide toggle.
- "Forgot password?" goes to a reset form, then a "check your email" confirmation (Firebase sends the email).
- Wrong credentials show an inline alert and mark the password field invalid.
- **No sign-up:** the card says accounts are created by an admin.
- While Firebase restores a session, show a full-screen splash ("Checking your session…").
- The Google button uses a neutral icon. If Google's official sign-in button is required, use their published asset, unmodified.

### Summary (landing, current month)
- Month switcher with previous/next.
- Four tiles: Net income, Spent, Saved & invested (counted in Spent), Left over.
- Income per source. Clicking a source opens a **modal** with that month's entries (gross, taxable, net, tax rate) and an "All sources combined" total.
- Spending by category as ranked bars, with a **Bars / Donut** toggle. Clicking a category row only **highlights** it.
- If template items are still unconfirmed, show an orange banner with a count.

### Add entries
- Quick single entry plus a batch table ("Add row", remove row) for logging several at once. Keyboard-first.
- Fields: date, merchant (autocomplete from past merchants), category, amount, optional note.
- Income entries take source, gross, gross taxable and net.
- An "Add refund" action creates a refund and can link it to an original expense.

### Transactions (details)
- **Income table:** date, source, label, gross, taxable, net, tax rate, with a total row.
- **Spending by category:** clicking a category here **filters** the expense list (unlike Summary, which only highlights).
- **Expense list:** filter chips by category with counts, plus search over merchant and note.
- **Unconfirmed items:** light-orange row, a pill reading "Unconfirmed · from template", and a per-row Confirm button. A banner at the top has "Confirm all as-is".

### Refunds (in the transaction list)
- **Refund rows:** negative amount in refund green on a light-green row. Below the merchant: "Refund for <merchant · date · amount>", linking to the original.
- **Tags:** "Full refund", "Partial refund", "From <Month>" when the original is in an earlier month, or "Not linked".
- **Original expenses** show what happened to them: "Refunded in full on <date> · net $0.00", with the amount struck through, or "Partly refunded · −$X on <date> · net $Y".
- **Filter chips:** All, Refunds, Not linked.
- **Linking dialog:** for an unlinked refund, "Link…" opens a dialog that searches recent expenses, shows a **Suggested** match (same category, close before the refund date), and links on confirm. Linking is optional.
- **Tiles:** refunds this month, spent before refunds, spent after refunds. Summary and Trends use the after-refunds figure.
- **Refund month:** a refund lowers spending in the month it is logged, in its own category, even when the original was in an earlier month.

### Templates
- Template list ("Your templates") and an editor for one template.
- Expense items take name, category, amount and day of month. Income items take source, label, gross, gross taxable and net.
- Apply a template to a chosen month. Copies land on each item's day of month; days that don't exist in that month (29–31) land on the month's last day (the backend does this, so don't recompute it in the client).

### Yearly
- Year switcher.
- Tiles: net income, spent, saved, left over for the year to date, with monthly averages.
- **Income vs. spent** paired bars per month. Clicking a month opens that month's Summary.
- Ranked category bars of monthly averages.
- Month-by-month table, where clicking a row opens that month; total and monthly-average rows at the bottom.

### Trends
Two tabs at the top: **Custom trends** and **By category**.

- **Custom trends**
  - Saved trends list on the left. Each shows its name, what it matches, the measure and a mini bar sparkline.
  - Selected trend:
    - definition pills (match, category, tracking since)
    - an **Amount / Count** toggle
    - tiles: year-to-date total, monthly average with change vs. last month, peak month, average per visit
    - **vertical bars per month**: clicking a bar lists that month's matching entries, with "Open in Transactions"
  - **New trend dialog:** name, match by Merchant / Category / Note contains (merchant field offers frequent merchants), measure Amount / Count.
- **By category**
  - Category chips, including "All spending".
  - Tiles for the selected month: spend, change vs. previous month, change vs. same month last year, year-to-date vs. last year.
  - **Paired bars**: this year vs. last year per month. Clicking a month selects it.
  - **Biggest movers:** every category ranked by change vs. the same month last year, drawn as **diverging bars** around a centre line. Clicking a category charts it.
  - Month-by-month table: spend, change vs. prior month (January compares with last December), last year's spend, change vs. last year, and a year-to-date total.
  - Uses the change-indicator colours above, with Saving flipped.

### Categories & sources
- **Expense categories**
  - Columns: drag handle to reorder (the order is used everywhere), name, entries, spent year to date.
  - Inline rename and delete.
  - Saving carries a "Counted as savings" badge.
  - **Other** carries a "Default" badge and a lock. It can never be renamed, edited or deleted, so it shows no actions and no drag handle.
- **Deleting a category:** a confirmation dialog states how many expenses (and how much) move to Other, and that templates using it switch to Other. Then Other's totals update.
- **Income sources:** entries, gross YTD, net YTD, calculated tax rate. An "Other" source is the default target when a source is deleted.
- An "Add category" / "Add source" field sits under each table.

### Admin panel (admins only)
Reached from the account menu; hidden from members. **v1 builds only app status and backups** (root §6.12).

- **Status tiles (v1):**
  - API server (from `/healthz`: version, uptime)
  - database (size, last write)
  - backups (last and next run)
  - sign-in (Firebase connected; no user counts)
- **Backups (v1):** list of weekly, monthly and manual snapshots with size and Download (encrypted archive), plus "Back up now". Confirm with a toast.
- **Not in v1 — do not build:** everything account-specific shown on the canvas. That means:
  - the users table, user counts, and Create account
  - Reset password, Disable/Enable, and Resend/Cancel invite
  - these stay in the Firebase console until v2; the canvas shows the v2 direction (admins cannot disable or demote themselves; admins never see other users' entries)
- Keep a "Firebase console" link in the header for account tasks.

### Empty states
- **New account** (first sign-in, no data)
  - Summary shows a welcome card with a 3-step checklist and a progress indicator: check categories & sources, build a template month, log your first entry. It can be hidden.
  - Tiles show $0.00 in muted text.
  - Income and Spending show dashed empty panels, each with a short explanation and an "Add …" button.
  - A note says Yearly and Trends fill in as months are logged.
- **New month** (no entries yet)
  - Summary offers **"Start <Month> from your template?"** with a preview of its bills and paychecks and their totals.
  - Actions: Copy into <Month>, Start blank, Edit template. Previous-month values are shown for reference.
  - After copying, an orange banner reads "N items copied … unconfirmed until you check each one", with Review in Transactions and Undo. Tiles and tables show the planned amounts with unconfirmed dots.

## Interaction patterns

- Dialogs are real modal dialogs: focus trapped, Esc closes, `aria-modal`, labelled by their heading. Destructive ones use `role="alertdialog"` and a danger button that names the outcome (e.g. "Delete and move to Other").
- Toasts confirm background actions (invite sent, backup finished, refund linked). Use `role="status"` and make them dismissible.
- Segmented toggles and chips expose `aria-pressed`. Radio-style pickers use `role="radiogroup"`/`role="radio"`.
- Charts get a text alternative (an `aria-label` per bar or a data table nearby).

## Quality

- Keyboard accessible, readable contrast in both themes, responsive down to laptop-sized windows. Layouts should still stack sensibly at phone width.
- Test money formatting, the income modal, refund and unconfirmed styling, the template-copy flow, category deletion moving entries to Other, and change-indicator colours (including the Saving flip).
- Run the linter, type check, and tests before finishing.

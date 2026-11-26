## QA pass results (#179)

Landed in #225. All checks are automated in `e2e/tests/a11y.spec.ts` and the `e2e` job is green in CI. Every axe check in the suite (old and new) now runs the full WCAG 2.0/2.1/2.2 A and AA rule set, not only colour contrast.

### What the checks found, and the fixes

- **Touch targets under 44px outside tables**: the filter chips on Transactions, New trend and Open in Transactions on Trends, Create/Cancel template and Add item / Add income in the template editor, Back up now and Add user on Admin, the unconfirmed banner's buttons, Welcome's dismiss button, the income source picker on Add entries (40px), the sidebar's Collapse button (36px wide) and the Skip to content link. All are now 44px. Controls inside dense tables (batch-entry cells, row buttons) stay at 36–38px, above WCAG 2.2's 24px.
- **Tab panels** (Trends, Admin) are Tab stops but drew no focus ring. They now draw the 3px ring.
- **Label in name (WCAG 2.5.3)**: the Summary income rows, ranked category rows, Transactions' category rows, Yearly's income-vs-spent bars and Trends' month pairs had accessible names that didn't contain their visible text in order. Names now follow the visible order:
  - "Job A, 2 entries, $3,600.00 net"
  - "Food, $400.00, 27% of income, +$100.00 (+33%), worse than last month"
  - "Jan: net income …, spent …. Open January summary"
- **Reduced motion**: tw-animate-css ignored `prefers-reduced-motion`. Dialogs, menus, popovers and the sidebar sheet no longer animate when it's set.
- **Account menu**: axe's `aria-hidden-focus` flags Radix's modal menu. Focus is trapped in the menu, so the hidden links can't be reached. A non-modal menu made the menu's unit tests flaky, so the menu stays modal and that one rule is skipped for it (documented in `e2e/AGENTS.md`).

### Intentional differences from the V2 canvas

- The controls listed above are 44px where the canvas draws them at 36–40px.
- A category named "Saving" no longer shows a "Saving" badge next to its name, because the badge would repeat the name. The badge still shows when the saving category has been renamed. Saving keeps its own bar colour either way.
- Page titles: the canvas titles a page with its period ("October 2026", "2026"). The app titles it with the screen name and puts the period in the eyebrow and the switcher.
- Charts use each category's own colour, as `web/AGENTS.md` says. The canvas draws ordinary categories in slate, Trends' current year in orange, and adds y-axis labels. The app uses no orange in charts (orange means "worse" in change badges) and has no y-axes.
- Transactions: the canvas header has four tiles, search and Export. The app's header has Apply / Save template, refund tiles under the income table, and search in the Expenses card.
- Yearly: the canvas puts the chart and the category table side by side. The app stacks them, and its month table has no Saved or % spent columns.
- Biggest movers leaves out categories with no year-over-year change (`trendChange.ts`), so it can list fewer than every category.
- The Admin status artboard predates #182: it still shows a Firebase tile and a Create account form. The Users artboard and the account menu match the app; the app also has Change password.

### Walk: things that look wrong, not intentional

Each screen was compared at 1440px against its artboard, in light and dark (dark spot-checked). Sign-in, Change password, Refunds and the empty states were not compared side by side; they're covered by the axe and screenshot tests.

1. **Summary, income** (root `AGENTS.md` §6.10): the monthly summary should show gross, gross taxable, net and the tax rate per source, plus "All sources combined". The canvas shows this as a table. The app shows only net per source on the page; the rest is in the source's dialog.
2. **Add entries**: at 1440px the batch table (760px minimum) is wider than its card. The Note column is cut off and needs sideways scrolling.
3. **Yearly, Monthly average by category**: "$16,170.00 for the year" wraps onto two lines.
4. **Trends, By category**: the "Saving" chip still shows a second "Saving" badge, the same redundancy #225 removed elsewhere.
5. Import: the template preview draws an "Expenses / Income" tab strip but lists both sheets' columns under Expenses. It's decorative (`aria-hidden`) but misleading.

### Other checks

- **Keyboard**: the account menu, dialogs (focus trapped and returned to the trigger), the merchant combobox, Bars/Donut and the sidebar all work keyboard-only, and every Tab stop on every screen shows a focus ring.
- **Reflow**: nothing scrolls sideways at 640px (200% zoom) or 375px. At phone width the sidebar sheet opens, closes with Esc and lands on the picked page.
- **Bundle** (vs. `5bbe873`, before #166): JS 186.6 → 235.6 kB gzip (+49 kB), CSS 12.5 → 18.7 kB gzip (+6.2 kB; the old CSS goes in #180). `lucide-react` is tree-shaken: 41 icons bundled, matching the named imports.
- **CSP**: `security-headers.spec.ts` passes with no violations.

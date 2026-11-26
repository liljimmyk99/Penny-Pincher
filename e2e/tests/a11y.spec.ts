/**
 * #179 · Accessibility after the shadcn/ui migration: axe (WCAG A/AA) on every screen and
 * every kind of overlay in both themes, keyboard-only use with a visible focus ring,
 * 44px touch targets, reflow at 200% zoom and phone width, and reduced motion.
 */
import type { Page, TestInfo } from "@playwright/test";
import { expect, signIn, submitSignIn, test } from "../support/fixtures";
import { expectAccessible, expectDark, type AxeOptions } from "../support/a11y";
import { todayIn } from "../support/dates";
import { Api, createAccount, type TestAccount } from "../support/stack";

const today = () => todayIn(undefined);

/** Every screen, with a heading that shows once it has loaded. */
const SCREENS = [
  ["/summary", "Summary"],
  ["/add", "Add entries"],
  ["/transactions", "Transactions"],
  ["/yearly", "Yearly"],
  ["/trends", "Trends"],
  ["/templates", "Your templates"],
  ["/categories", "Categories & sources"],
  ["/import", "Import"],
  ["/export", "Export data"],
  ["/settings", "Settings"],
  ["/admin", "Admin dashboard"],
  ["/nowhere", "Page not found"],
] as const;

/** An admin (so the admin panel is reachable) with an expense, a refund, Saving and income. */
async function seededAdmin(label: string): Promise<{ account: TestAccount; api: Api }> {
  const account = createAccount(label, { role: "admin" });
  const api = await Api.as(account);
  const food = await api.createExpense({ date: today(), amount_cents: 2500, category: "Food", merchant: "Access Grocer" });
  await api.createExpense({ date: today(), amount_cents: -500, category: "Food", merchant: "Access Grocer", refunded_expense_id: food.id });
  await api.createExpense({ date: today(), amount_cents: 4000, category: "Saving", merchant: "Savings Account" });
  const source = await api.createSource("Access Job");
  await api.createIncome({ date: today(), source, gross: 300000, taxable: 280000, net: 220000 });
  return { account, api };
}

/** Esc closes the open dialog or menu; wait until it is gone, exit animation and all. */
async function closeOverlay(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator("[role=dialog], [role=alertdialog], [role=menu], [role=listbox]")).toHaveCount(0);
}

/** Signs in on `path` and waits for its heading. */
async function signInTo(page: Page, account: TestAccount, path: string, heading: string) {
  await signIn(page, account, path);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

async function openScreen(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: heading, exact: true }).first(), path).toBeVisible();
  await page.waitForLoadState("networkidle");
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`axe in ${colorScheme} mode`, () => {
    test.use({ colorScheme });

    const check = async (page: Page, testInfo: TestInfo, label: string, options?: AxeOptions) => {
      if (colorScheme === "dark") await expectDark(page);
      await expectAccessible(page, testInfo, `${colorScheme} ${label}`, options);
    };

    test(`every screen passes axe in ${colorScheme} mode`, async ({ page }, testInfo) => {
      const { account, api } = await seededAdmin(`axe-${colorScheme}`);
      try {
        await page.goto("/summary");
        await submitSignIn(page, account.username, "not-the-password");
        await expect(page.getByRole("alert")).toContainText("Wrong username or password");
        await check(page, testInfo, "sign-in with its error");

        await signInTo(page, account, "/summary", "Summary");
        for (const [path, heading] of SCREENS) {
          await openScreen(page, path, heading);
          await check(page, testInfo, path);
        }

        // The other half of each switch: the donut, Trends by category, the admin Users tab.
        await openScreen(page, "/summary", "Summary");
        await page.getByRole("radio", { name: "Donut", exact: true }).click();
        await check(page, testInfo, "/summary donut");
        await openScreen(page, "/trends", "Trends");
        await page.getByRole("tab", { name: "By category" }).click();
        await check(page, testInfo, "/trends by category");
        await openScreen(page, "/admin", "Admin dashboard");
        await page.getByRole("tab", { name: "Users" }).click();
        await expect(page.getByRole("table", { name: "Users, oldest first" })).toBeVisible();
        await check(page, testInfo, "/admin users");
      } finally {
        await api.dispose();
      }
    });

    test(`dialogs, menus, the combobox and toasts pass axe in ${colorScheme} mode`, async ({ page }, testInfo) => {
      const { account, api } = await seededAdmin(`overlays-${colorScheme}`);
      try {
        await signInTo(page, account, "/summary", "Summary");

        await page.getByRole("button", { name: /^Access Job, / }).click();
        await expect(page.getByRole("dialog", { name: "Access Job" })).toBeVisible();
        await check(page, testInfo, "income modal");
        await closeOverlay(page);

        await page.getByRole("button", { name: /Admin$/ }).click();
        await expect(page.getByRole("menu", { name: "Account" })).toBeVisible();
        // Radix's modal menu marks the rest of the page aria-hidden while its links stay
        // focusable. They can't be reached: focus is trapped in the menu and clicks outside
        // only close it. A non-modal menu would avoid the warning but made the menu's unit
        // tests flaky (#179), so this one rule is skipped here.
        await check(page, testInfo, "account menu", { disable: ["aria-hidden-focus"] });
        await closeOverlay(page);

        await openScreen(page, "/transactions", "Transactions");
        await page.getByRole("button", { name: /^Edit expense Access Grocer/ }).first().click();
        await expect(page.getByRole("dialog", { name: "Edit expense" })).toBeVisible();
        await check(page, testInfo, "edit expense dialog");
        await closeOverlay(page);
        await page.getByRole("button", { name: /^Delete expense Access Grocer/ }).first().click();
        await expect(page.getByRole("alertdialog", { name: "Delete this expense?" })).toBeVisible();
        await check(page, testInfo, "delete confirmation");
        await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
        await expect(page.getByRole("alertdialog")).toHaveCount(0);

        await page.getByRole("button", { name: "Save as template…" }).click();
        await page.getByRole("dialog", { name: /^Save .+ as a template$/ }).getByRole("button", { name: "Save template" }).click();
        await expect(page.getByRole("region", { name: /^Notifications/ }).getByText(/^Saved .+ as the template/)).toBeVisible();
        await check(page, testInfo, "toast");

        await openScreen(page, "/add", "Add entries");
        await page.getByRole("combobox", { name: "Merchant, row 1" }).fill("Access");
        await expect(page.getByRole("option", { name: "Access Grocer" })).toBeVisible();
        await check(page, testInfo, "merchant suggestions");
        await closeOverlay(page);

        await openScreen(page, "/admin", "Admin dashboard");
        await page.getByRole("tab", { name: "Users" }).click();
        await page.getByRole("button", { name: "Add user" }).click();
        const addUser = page.getByRole("dialog", { name: "Add user" });
        await expect(addUser).toBeVisible();
        await addUser.getByRole("button", { name: "Generate" }).click();
        await expect(addUser.getByLabel("Initial password")).not.toHaveValue("");
        await check(page, testInfo, "add user dialog");
        await closeOverlay(page);

        // The shared password pieces (#201): the Show/Hide toggle pressed and the live
        // checklist with met and unmet rules.
        await page.getByRole("button", { name: /Admin$/ }).click();
        await page.getByRole("menuitem", { name: "Change password" }).click();
        const change = page.getByRole("dialog", { name: "Change password" });
        await expect(change).toBeVisible();
        await change.getByLabel("New password", { exact: true }).fill("short");
        await change.getByRole("button", { name: "Show passwords" }).click();
        await expect(change.getByRole("button", { name: "Hide passwords" })).toHaveAttribute("aria-pressed", "true");
        await expect(change.getByRole("list", { name: "Password requirements" })).toContainText("(not met)");
        await check(page, testInfo, "change password dialog");
        await closeOverlay(page);
      } finally {
        await api.dispose();
      }
    });
  });
}

/** Whether the focused element draws a focus indicator: an outline or a box-shadow ring. */
function focusIndicator(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { name: "body", visible: true };
    const s = getComputedStyle(el);
    const outline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
    const ring = s.boxShadow !== "none" && /\d+px/.test(s.boxShadow);
    const name = `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}"`;
    return { name, visible: outline || ring };
  });
}

test.describe("keyboard only", () => {
  // Transitions finish at once, so the ring is read at its final width.
  test.use({ reducedMotion: "reduce" });

  test("every stop on each screen shows a focus ring", async ({ page }) => {
    const { account, api } = await seededAdmin("focus");
    try {
      await signInTo(page, account, "/summary", "Summary");
      const missing: string[] = [];
      for (const [path, heading] of SCREENS) {
        await openScreen(page, path, heading);
        await page.locator("body").focus();
        const seen = new Set<string>();
        for (let i = 0; i < 80; i++) {
          await page.keyboard.press("Tab");
          const { name, visible } = await focusIndicator(page);
          if (seen.has(name)) break; // wrapped round
          seen.add(name);
          if (!visible) missing.push(`${path}: ${name}`);
        }
      }
      expect(missing, "focused elements with no visible focus ring").toEqual([]);
    } finally {
      await api.dispose();
    }
  });

  test("the account menu, a dialog, the combobox, the chart toggle and the sidebar work with the keyboard", async ({
    page,
  }) => {
    const { account, api } = await seededAdmin("keys");
    try {
      await signInTo(page, account, "/summary", "Summary");

      // Account menu: Enter opens it on its first item, arrows move, Esc closes and returns focus.
      const accountButton = page.getByRole("button", { name: /Admin$/ });
      await accountButton.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("menu", { name: "Account" })).toBeVisible();
      await page.keyboard.press("ArrowDown");
      await expect(page.locator(":focus")).toHaveAttribute("role", /^menuitem/);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(accountButton).toBeFocused();

      // Bars / Donut: arrows move between the two, Space picks one.
      const bars = page.getByRole("radio", { name: "Bars", exact: true });
      await bars.focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("radio", { name: "Donut", exact: true })).toBeFocused();
      await page.keyboard.press("Space");
      await expect(page.getByRole("radio", { name: "Donut", exact: true })).toHaveAttribute("aria-checked", "true");

      // A dialog: Enter opens it, Tab stays inside, Esc closes and returns focus.
      await openScreen(page, "/transactions", "Transactions");
      const edit = page.getByRole("button", { name: /^Edit expense Access Grocer/ }).first();
      await edit.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Edit expense" });
      await expect(dialog).toBeVisible();
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press("Tab");
        expect(await dialog.evaluate((d) => d.contains(document.activeElement)), `Tab ${i + 1} stays in the dialog`).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(edit).toBeFocused();

      // The merchant combobox: type, arrow to a suggestion, Enter picks it.
      await openScreen(page, "/add", "Add entries");
      const merchant = page.getByRole("combobox", { name: "Merchant, row 1" });
      await merchant.focus();
      await page.keyboard.type("Access");
      await expect(page.getByRole("option", { name: "Access Grocer" })).toBeVisible();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(merchant).toHaveValue("Access Grocer");
      await expect(page.getByRole("option")).toHaveCount(0);

      // The sidebar: a link is reached and followed with the keyboard; focus lands on the new h1.
      const yearly = page.getByRole("link", { name: "Yearly", exact: true });
      await yearly.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { level: 1, name: "Yearly" })).toBeFocused();
    } finally {
      await api.dispose();
    }
  });
});

test("touch targets are at least 44px, and controls in dense tables at least 24px", async ({ page }) => {
  const { account, api } = await seededAdmin("targets");
  try {
    await signInTo(page, account, "/summary", "Summary");
    const small: string[] = [];
    for (const [path, heading] of SCREENS) {
      await openScreen(page, path, heading);
      small.push(
        ...(await page.evaluate((path) => {
          const selector =
            'button, a[href], input:not([type=hidden]), select, textarea, [role=combobox], [role=checkbox], [role=radio], [role=tab], [role=switch]';
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>(selector)) {
            const r = el.getBoundingClientRect();
            // Not drawn, or visually hidden behind a visible control (the Import file input).
            if (r.width <= 1 || r.height <= 1 || getComputedStyle(el).visibility === "hidden") continue;
            // Links inside a sentence are exempt (WCAG 2.5.8, inline).
            if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
            // A control's label is part of its target (a checkbox and its text).
            let w = r.width;
            let h = r.height;
            const labels = (el as HTMLInputElement).labels;
            for (const label of labels ?? []) {
              const l = label.getBoundingClientRect();
              const top = Math.min(r.top, l.top), bottom = Math.max(r.bottom, l.bottom);
              const left = Math.min(r.left, l.left), right = Math.max(r.right, l.right);
              w = Math.max(w, right - left);
              h = Math.max(h, bottom - top);
            }
            // The documented exception (web/AGENTS.md): controls in dense table rows (the sm and
            // icon-sm buttons, the batch entry's cell inputs) still need WCAG 2.2's 24px.
            const dense = !!el.closest("table");
            const min = dense ? 24 : 44;
            if (Math.round(w) < min || Math.round(h) < min) {
              const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40);
              out.push(`${path}: ${el.tagName.toLowerCase()}${el.dataset.slot ? `[${el.dataset.slot}]` : ""} "${name}" ${Math.round(w)}×${Math.round(h)} (min ${min})`);
            }
          }
          return out;
        }, path)),
      );
    }
    expect(small, "controls smaller than their minimum target").toEqual([]);
  } finally {
    await api.dispose();
  }
});

test.describe("reflow", () => {
  for (const [label, width] of [["200% zoom", 640], ["phone width", 375]] as const) {
    test(`nothing scrolls sideways at ${label} (${width}px)`, async ({ page }) => {
      const { account, api } = await seededAdmin(`reflow-${width}`);
      try {
        await page.setViewportSize({ width, height: 800 });
        await signInTo(page, account, "/summary", "Summary");
        const wide: string[] = [];
        for (const [path, heading] of SCREENS) {
          await openScreen(page, path, heading);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (overflow > 0) wide.push(`${path}: ${overflow}px`);
        }
        expect(wide, "screens wider than the window").toEqual([]);
      } finally {
        await api.dispose();
      }
    });
  }

  test("at phone width the sidebar is a sheet that works with the keyboard", async ({ page }) => {
    const { account, api } = await seededAdmin("sheet");
    try {
      await page.setViewportSize({ width: 375, height: 812 });
      await signInTo(page, account, "/summary", "Summary");
      const trigger = page.getByRole("button", { name: "Open navigation" });
      await expect(page.getByRole("link", { name: "Yearly", exact: true })).toBeHidden();

      // Esc closes it and returns focus to the trigger.
      await trigger.focus();
      await page.keyboard.press("Enter");
      const sheet = page.getByRole("dialog");
      await expect(sheet.getByRole("link", { name: "Yearly", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(trigger).toBeFocused();

      // Picking a page closes it and lands on that page's heading.
      await page.keyboard.press("Enter");
      await sheet.getByRole("link", { name: "Yearly", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(sheet).toBeHidden();
      await expect(page.getByRole("heading", { level: 1, name: "Yearly" })).toBeFocused();
    } finally {
      await api.dispose();
    }
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("dialogs, menus and the sidebar sheet don't animate when reduced motion is asked for", async ({ signedIn: page, api }) => {
    await api.createExpense({ date: today(), amount_cents: 1200, category: "Food", merchant: "Still Shop" });
    await page.reload();
    const duration = (selector: string) =>
      page.locator(selector).first().evaluate((el) => {
        const s = getComputedStyle(el);
        const secs = (v: string) => Math.max(...v.split(",").map((d) => (d.trim().endsWith("ms") ? parseFloat(d) / 1000 : parseFloat(d))));
        return Math.max(secs(s.animationDuration), secs(s.transitionDuration));
      });

    await page.getByRole("button", { name: /^Edit expense Still Shop/ }).click();
    await expect(page.getByRole("dialog", { name: "Edit expense" })).toBeVisible();
    expect(await duration("[data-slot=dialog-content]")).toBeLessThanOrEqual(0.001);
    expect(await duration("[data-slot=dialog-overlay]")).toBeLessThanOrEqual(0.001);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: /Member$/ }).click();
    await expect(page.getByRole("menu", { name: "Account" })).toBeVisible();
    expect(await duration("[data-slot=dropdown-menu-content]")).toBeLessThanOrEqual(0.001);
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await duration("[data-sidebar=sidebar][data-mobile=true]")).toBeLessThanOrEqual(0.001);
  });
});

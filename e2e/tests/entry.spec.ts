/** M1 gate · Entry (#24): the Add entries screen on the real stack. */
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { monthOf, todayIn, zoneOffUtcDate } from "../support/dates";

const today = () => todayIn(undefined);

async function openAdd(page: Page) {
  await page.getByRole("link", { name: "Add entries" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Add entries" })).toBeVisible();
}

/** Presses Tab (nothing else) until `target` has focus. */
async function tabTo(page: Page, target: ReturnType<Page["getByLabel"]>, max = 60) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab never reached the target field");
}

const merchant = (page: Page, row: number) => page.getByRole("combobox", { name: `Merchant, row ${row}` });
const category = (page: Page, row: number) => page.getByLabel(`Category, row ${row}`);
const amount = (page: Page, row: number) => page.getByLabel(`Amount, row ${row}`, { exact: true });
const saved = (page: Page) => page.locator(".entry-card__saved").first();

test("a whole quick entry and a whole batch entry, keyboard only", async ({ signedIn: page, api }) => {
  await openAdd(page);
  const kb = page.keyboard;

  // Quick entry: one row, saved with Ctrl+Enter (accepted on every platform).
  await tabTo(page, merchant(page, 1));
  await kb.type("Corner Store");
  await kb.press("Escape"); // close suggestions, if any
  await kb.press("Tab");
  await expect(category(page, 1)).toBeFocused();
  await kb.type("Food"); // select typeahead
  await kb.press("Tab");
  await expect(amount(page, 1)).toBeFocused();
  await kb.type("12.34");
  await kb.press("Control+Enter");
  await expect(saved(page)).toHaveText(/Saved 1 entry · \$12\.34 net\./);

  // Batch: Enter moves to a new row; Ctrl+Enter saves them all.
  await expect(merchant(page, 1)).toBeFocused();
  await kb.type("Bakery");
  await kb.press("Escape");
  await kb.press("Tab");
  await kb.type("Food");
  await kb.press("Tab");
  await kb.type("5");
  await kb.press("Tab");
  await kb.type("bread");
  await kb.press("Enter");
  await expect(merchant(page, 2)).toBeFocused();
  await kb.type("Bus Pass");
  await kb.press("Escape");
  await kb.press("Tab");
  await kb.type("Transportation");
  await kb.press("Tab");
  await kb.type("40");
  await kb.press("Control+Enter");
  await expect(saved(page)).toHaveText(/Saved 2 entries · \$45\.00 net\./);

  const food = await api.category("Food");
  const transport = await api.category("Transportation");
  const rows = (await api.expenses(monthOf(today()))).map((e) => [e.merchant.name, e.category_id, e.amount_cents, e.note]);
  expect(rows).toEqual(
    expect.arrayContaining([
      ["Corner Store", food.id, 1234, null],
      ["Bakery", food.id, 500, "bread"],
      ["Bus Pass", transport.id, 4000, null],
    ]),
  );
  expect(rows).toHaveLength(3);
});

test("merchant autocomplete reuses the existing merchant, whatever the case", async ({ signedIn: page, api }) => {
  await api.createExpense({ date: today(), amount_cents: 300, category: "Food", merchant: "Corner Store" });
  await openAdd(page);

  // Pick the suggestion with the keyboard.
  await merchant(page, 1).click();
  await page.keyboard.type("corner");
  await expect(page.getByRole("option", { name: "Corner Store" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(merchant(page, 1)).toHaveValue("Corner Store");
  // The category comes from that merchant's last expense.
  await expect(category(page, 1)).toHaveValue((await api.category("Food")).id);
  await amount(page, 1).fill("2.00");

  // Type it in a different case without picking: the server still matches it.
  await page.getByRole("button", { name: "Add row" }).click();
  await merchant(page, 2).fill("CORNER STORE");
  await merchant(page, 2).press("Escape");
  await category(page, 2).selectOption({ label: "Food" });
  await amount(page, 2).fill("1.00");
  await page.getByRole("button", { name: "Save 2 entries" }).click();
  await expect(saved(page)).toHaveText(/Saved 2 entries/);

  const matches = (await api.merchants()).filter((m) => m.name.toLowerCase() === "corner store");
  expect(matches).toHaveLength(1);
  const expenses = await api.expenses(monthOf(today()));
  expect(new Set(expenses.map((e) => e.merchant.id))).toEqual(new Set([matches[0].id]));
});

test("one bad row blocks the whole batch, flags that row, and saves nothing", async ({ signedIn: page, api }) => {
  await openAdd(page);
  await merchant(page, 1).fill("Good Row");
  await category(page, 1).selectOption({ label: "Food" });
  await amount(page, 1).fill("10.00");
  await page.getByRole("button", { name: "Add row" }).click();
  await merchant(page, 2).fill("Bad Row");
  await category(page, 2).selectOption({ label: "Food" });
  await amount(page, 2).fill("ten dollars");
  await page.getByRole("button", { name: "Save 2 entries" }).click();

  await expect(page.getByRole("alert")).toContainText("Nothing was saved.");
  await expect(amount(page, 2)).toHaveAttribute("aria-invalid", "true");
  await expect(amount(page, 1)).not.toHaveAttribute("aria-invalid", "true");
  // Both rows are still in the form, and nothing reached the API.
  await expect(merchant(page, 1)).toHaveValue("Good Row");
  expect(await api.expenses(monthOf(today()))).toHaveLength(0);
});

test("amounts round-trip as exact cents through save, reload and edit", async ({ signedIn: page, api }) => {
  const cases = [
    { typed: "4.5", cents: 450, shown: "$4.50" },
    { typed: ".99", cents: 99, shown: "$0.99" },
    { typed: "1,234.56", cents: 123456, shown: "$1,234.56" },
    { typed: "19.99", cents: 1999, shown: "$19.99" },
    { typed: "0.10", cents: 10, shown: "$0.10" },
  ];
  await openAdd(page);
  for (const [i, c] of cases.entries()) {
    if (i > 0) await page.getByRole("button", { name: "Add row" }).click();
    await merchant(page, i + 1).fill(`Amount Check ${i + 1}`);
    await merchant(page, i + 1).press("Escape");
    await category(page, i + 1).selectOption({ label: "Food" });
    await amount(page, i + 1).fill(c.typed);
  }
  await page.getByRole("button", { name: `Save ${cases.length} entries` }).click();
  await expect(saved(page)).toHaveText(/Saved 5 entries · \$1,260\.14 net\./);

  const month = monthOf(today());
  const byMerchant = async () => new Map((await api.expenses(month)).map((e) => [e.merchant.name, e.amount_cents]));
  expect(await byMerchant()).toEqual(new Map(cases.map((c, i) => [`Amount Check ${i + 1}`, c.cents])));

  await page.goto(`/transactions?month=${month}`);
  await page.reload();
  for (const [i, c] of cases.entries()) {
    const row = page.getByRole("row").filter({ hasText: `Amount Check ${i + 1}` });
    await expect(row.locator(".tx-table__amount")).toHaveText(c.shown);
    // Edit: the field shows the same value; typing what was first typed saves the same cents.
    await row.getByRole("button", { name: /^Edit expense/ }).click();
    const dialog = page.getByRole("dialog", { name: "Edit expense" });
    const field = dialog.getByLabel("Amount");
    await expect(field).toHaveValue(c.shown.replace("$", "").replace(/,/g, ""));
    await field.fill(c.typed);
    await dialog.getByLabel("Note").fill(`edited ${i + 1}`); // forces a real PATCH
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await expect(row.locator(".tx-table__amount")).toHaveText(c.shown);
  }
  expect(await byMerchant()).toEqual(new Map(cases.map((c, i) => [`Amount Check ${i + 1}`, c.cents])));
});

test.describe("dates in a time zone whose day differs from UTC's", () => {
  const timezoneId = zoneOffUtcDate();
  test.use({ timezoneId });

  test("an expense dated today stays on today", async ({ signedIn: page, api }) => {
    const localToday = todayIn(timezoneId);
    // Guard: the test only proves something when local and UTC dates differ.
    expect(localToday).not.toBe(new Date().toISOString().slice(0, 10));

    await openAdd(page);
    await expect(page.getByLabel("Date, row 1")).toHaveValue(localToday);
    await merchant(page, 1).fill("Late Night Diner");
    await merchant(page, 1).press("Escape");
    await category(page, 1).selectOption({ label: "Food" });
    await amount(page, 1).fill("9.00");
    await page.getByRole("button", { name: "Save entry" }).click();
    await expect(saved(page)).toHaveText(/Saved 1 entry/);

    const [saved1] = await api.expenses(monthOf(localToday));
    expect(saved1?.date).toBe(localToday);
    await page.goto(`/transactions?month=${monthOf(localToday)}`);
    const row = page.getByRole("row").filter({ hasText: "Late Night Diner" });
    await expect(row.locator(".tx-table__date")).toHaveText(
      new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: timezoneId }).format(new Date()),
    );
  });
});

test("several income entries in one month, including a one-off under Other", async ({ signedIn: page, api }) => {
  await api.createSource("Main Job");
  await page.goto("/add"); // load the new source fresh
  await expect(page.getByRole("heading", { level: 1, name: "Add entries" })).toBeVisible();
  const income = page.getByRole("region", { name: "Income" });

  async function addIncome(source: string, label: string, gross: string, taxable: string, net: string) {
    await income.getByRole("radio", { name: source }).click();
    await income.getByLabel(/^Label/).fill(label);
    await income.getByLabel("Gross", { exact: true }).fill(gross);
    await income.getByLabel("Gross taxable").fill(taxable);
    await income.getByLabel("Net", { exact: true }).fill(net);
    await income.getByRole("button", { name: "Save income" }).click();
    await expect(income.getByRole("status")).toContainText(`from ${source}`);
  }
  await addIncome("Main Job", "Paycheck", "2000", "1800", "1500.25");
  await addIncome("Main Job", "Paycheck", "2000", "1800", "1500.25");
  await addIncome("Other", "One-off job", "300", "0", "300");

  const soFar = income.locator(".so-far");
  await expect(soFar).toContainText("Main Job · 2 entries");
  await expect(soFar).toContainText("$3,000.50");
  await expect(soFar).toContainText("Other · 1 entry");
  await expect(soFar.locator(".so-far__row--total")).toContainText("$3,300.50");

  const entries = await api.income(monthOf(today()));
  expect(entries.map((e) => e.net_cents).sort((a, b) => a - b)).toEqual([30000, 150025, 150025]);
  const other = (await api.sources()).find((s) => s.name === "Other")!;
  expect(entries.filter((e) => e.income_source_id === other.id)).toHaveLength(1);
});

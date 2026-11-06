/** M1 gate · Transactions (#25): browsing, editing and deleting a month's entries. */
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { formatMonth, monthOf, shiftMonth, todayIn } from "../support/dates";
import { parseMoney } from "../support/money";

const thisMonth = () => monthOf(todayIn(undefined));
const lastMonth = () => shiftMonth(thisMonth(), -1);

const expenseRow = (page: Page, merchant: string) => page.locator("table.tx-table--expenses tbody tr").filter({ hasText: merchant });
const footer = (page: Page) => page.locator(".tx__footer");
const categoryButton = (page: Page, name: string) => page.locator(".cat-rows button.cat-row").filter({ hasText: name });

/** Marks the document, so a later check can tell whether the page reloaded. */
const markDocument = (page: Page) => page.evaluate(() => ((window as unknown as { __e2e: number }).__e2e = 1));
const notReloaded = async (page: Page) =>
  expect(await page.evaluate(() => (window as unknown as { __e2e?: number }).__e2e)).toBe(1);

test("open a past month", async ({ signedIn: page, api }) => {
  await api.createExpense({ date: `${lastMonth()}-03`, amount_cents: 2500, category: "Food", merchant: "Past Grocer" });
  // The empty month's template offer has already loaded last month (for its
  // "last month" figures), before this expense existed: start from a fresh page.
  await page.reload();
  await page.getByRole("button", { name: `Previous month, ${formatMonth(lastMonth())}` }).click();
  await expect(page.getByRole("group", { name: "Month" })).toContainText(formatMonth(lastMonth()));
  await expect(page).toHaveURL(new RegExp(`month=${lastMonth()}`));
  await expect(expenseRow(page, "Past Grocer")).toContainText("$25.00");
});

test("editing an amount updates the totals without a reload", async ({ signedIn: page, api }) => {
  const day = `${thisMonth()}-01`;
  await api.createExpense({ date: day, amount_cents: 1000, category: "Food", merchant: "Edit Me" });
  await api.createExpense({ date: day, amount_cents: 2000, category: "Housing", merchant: "Stay Put" });
  await page.reload();
  await expect(footer(page)).toHaveText("2 expenses · $30.00");
  await markDocument(page);

  await expenseRow(page, "Edit Me").getByRole("button", { name: /^Edit expense/ }).click();
  const dialog = page.getByRole("dialog", { name: "Edit expense" });
  await dialog.getByLabel("Amount").fill("15.00");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();

  await expect(footer(page)).toHaveText("2 expenses · $35.00");
  await expect(categoryButton(page, "Food")).toContainText("$15.00");
  await expect(page.locator(".cat-row--total")).toContainText("$35.00");
  await notReloaded(page);
});

test("moving an entry's date into another month moves it to that month", async ({ signedIn: page, api }) => {
  await api.createExpense({ date: `${thisMonth()}-02`, amount_cents: 700, category: "Food", merchant: "Wrong Month" });
  await page.reload();
  await expenseRow(page, "Wrong Month").getByRole("button", { name: /^Edit expense/ }).click();
  const dialog = page.getByRole("dialog", { name: "Edit expense" });
  await dialog.getByLabel("Date").fill(`${lastMonth()}-28`);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();

  await expect(expenseRow(page, "Wrong Month")).toHaveCount(0);
  await page.getByRole("button", { name: `Previous month, ${formatMonth(lastMonth())}` }).click();
  await expect(expenseRow(page, "Wrong Month")).toContainText("$7.00");
});

test("delete asks for confirmation first", async ({ signedIn: page, api }) => {
  await api.createExpense({ date: `${thisMonth()}-01`, amount_cents: 1200, category: "Food", merchant: "Delete Me" });
  await page.reload();
  const row = expenseRow(page, "Delete Me");

  await row.getByRole("button", { name: /^Delete expense/ }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete this expense?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(row).toHaveCount(1);
  expect(await api.expenses(thisMonth())).toHaveLength(1);

  await row.getByRole("button", { name: /^Delete expense/ }).click();
  await confirm.getByRole("button", { name: "Delete expense" }).click();
  await expect(row).toHaveCount(0);
  expect(await api.expenses(thisMonth())).toHaveLength(0);
});

test("the category filter works and category totals add up to the grand total", async ({ signedIn: page, api }) => {
  const day = `${thisMonth()}-04`;
  const entries = [
    { merchant: "Grocer A", category: "Food", amount_cents: 1999 },
    { merchant: "Grocer B", category: "Food", amount_cents: 501 },
    { merchant: "Landlord", category: "Housing", amount_cents: 120000 },
    { merchant: "Cinema", category: "Entertainment", amount_cents: 1350 },
    { merchant: "Savings Account", category: "Saving", amount_cents: 25000 },
    { merchant: "Cinema", category: "Entertainment", amount_cents: -350 }, // a refund
  ];
  for (const e of entries) await api.createExpense({ date: day, ...e });
  await page.reload();
  const total = entries.reduce((sum, e) => sum + e.amount_cents, 0);
  await expect(page.locator(".cat-rows button.cat-row")).toHaveCount(4); // loaded: Food, Housing, Entertainment, Saving

  // Every category's total, summed, equals "Total spent" and the list footer.
  const shown = await page.locator(".cat-rows button.cat-row .num:not(.cat-row__share)").allTextContents();
  expect(shown.map(parseMoney).reduce((a, b) => a + b, 0)).toBe(total);
  expect(parseMoney(await page.locator(".cat-row--total .num").first().innerText())).toBe(total);
  await expect(footer(page)).toHaveText(`6 expenses · ${(await page.locator(".cat-row--total .num").first().innerText()).trim()}`);

  // Filtering by Food shows only Food, by the row button or the chip.
  await categoryButton(page, "Food").click();
  await expect(page).toHaveURL(/category=/);
  const rows = page.locator("table.tx-table--expenses tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Food" })).toHaveCount(2);
  await expect(footer(page)).toHaveText("Showing 2 of 6 expenses · $25.00");

  await page.getByRole("group", { name: "Filter by category" }).getByRole("button", { name: /^Entertainment/ }).click();
  await expect(rows).toHaveCount(2);
  await expect(footer(page)).toHaveText("Showing 2 of 6 expenses · $10.00");

  await page.getByRole("group", { name: "Filter by category" }).getByRole("button", { name: /^All categories/ }).click();
  await expect(rows).toHaveCount(6);
});

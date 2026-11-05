/** M1 gate · Refunds (#26): how refunds look, link, count and survive their original. */
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { formatMonth, monthName, monthOf, shiftMonth, todayIn } from "../support/dates";

const thisMonth = () => monthOf(todayIn(undefined));
const lastMonth = () => shiftMonth(thisMonth(), -1);
const rows = (page: Page) => page.locator("table.tx-table--expenses tbody tr");
const row = (page: Page, merchant: string, kind: "expense" | "refund") =>
  rows(page).filter({ has: page.getByRole("button", { name: new RegExp(`^Edit ${kind} ${merchant}`) }) });

test("a refund looks different from an expense", async ({ signedIn: page, api }) => {
  const day = `${thisMonth()}-05`;
  await api.createExpense({ date: day, amount_cents: 4000, category: "Food", merchant: "Corner Store" });
  await api.createExpense({ date: day, amount_cents: -1500, category: "Food", merchant: "Corner Store" });
  await page.reload();

  const expense = row(page, "Corner Store", "expense");
  const refund = row(page, "Corner Store", "refund");
  await expect(refund).toHaveClass(/is-refund/);
  await expect(expense).not.toHaveClass(/is-refund/);
  await expect(refund.locator(".tx-table__amount")).toHaveText("−$15.00");
  await expect(refund.locator(".pill")).toHaveText("Not linked");

  // Not only a class: the refund's amount is drawn in a different colour.
  const color = (l: ReturnType<typeof row>) => l.locator(".tx-table__amount").evaluate((el) => getComputedStyle(el).color);
  expect(await color(refund)).not.toBe(await color(expense));
});

test("a refund linked to last month's expense counts this month; the original shows its net", async ({ signedIn: page, api }) => {
  const original = await api.createExpense({
    date: `${lastMonth()}-20`,
    amount_cents: 10000,
    category: "Entertainment",
    merchant: "Gadget Shop",
  });

  // Log the refund on Add entries, linking it with the "Refund for" picker.
  await page.goto(`/add?month=${thisMonth()}`);
  await page.getByRole("button", { name: "Add refund" }).click();
  const merchant = page.getByRole("combobox", { name: "Merchant, row 2" });
  await merchant.fill("Gadget");
  await page.getByRole("option", { name: "Gadget Shop" }).click();
  const link = page.getByLabel("Refund for, row 2");
  await expect(link.locator("option", { hasText: "$100.00" })).toHaveCount(1);
  await link.selectOption({ index: 1 });
  await expect(page.getByLabel("Category, row 2")).toHaveValue(original.category_id);
  await page.getByLabel("Refund amount, row 2").fill("30");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.locator(".entry-card__saved").first()).toHaveText(/Saved 1 entry · −\$30\.00 net\./);

  const [refund] = (await api.expenses(thisMonth())).filter((e) => e.amount_cents < 0);
  expect(refund).toMatchObject({ amount_cents: -3000, refunded_expense_id: original.id, category_id: original.category_id });

  // This month: the refund is here, tagged with its original's month, and lowers this month's spending.
  await page.goto(`/transactions?month=${thisMonth()}`);
  const r = row(page, "Gadget Shop", "refund");
  await expect(r.locator(".pill")).toHaveText(`From ${monthName(lastMonth())}${lastMonth().slice(0, 4) === thisMonth().slice(0, 4) ? "" : ` ${lastMonth().slice(0, 4)}`}`);
  await expect(r.locator(".tx-refund-for")).toContainText("Refund for Gadget Shop");
  await expect(page.locator(".cat-rows button.cat-row").filter({ hasText: "Entertainment" })).toContainText("−$30.00");
  const tiles = page.getByRole("region", { name: "Refunds this month" });
  await expect(tiles).toContainText("−$30.00");
  await expect(tiles).toContainText("1 refund · 1 linked to an expense");

  // Last month: the original keeps its amount and shows the net after the partial refund.
  await page.getByRole("button", { name: `Previous month, ${formatMonth(lastMonth())}` }).click();
  const o = row(page, "Gadget Shop", "expense");
  await expect(o.locator(".tx-table__amount")).toHaveText("$100.00");
  await expect(o.locator(".tx-refunded")).toContainText("Partly refunded · −$30.00");
  await expect(o.locator(".tx-refunded")).toContainText("net $70.00");
  await expect(page.locator(".cat-rows button.cat-row").filter({ hasText: "Entertainment" })).toContainText("$100.00");
  expect((await api.expense(original.id)).refunded_total_cents).toBe(-3000);
});

test("deleting the original keeps the refund, unlinked", async ({ signedIn: page, api }) => {
  const original = await api.createExpense({ date: `${lastMonth()}-10`, amount_cents: 5000, category: "Food", merchant: "Return Desk" });
  const refund = await api.createExpense({
    date: `${thisMonth()}-01`,
    amount_cents: -2000,
    category: "Food",
    merchant: "Return Desk",
    refunded_expense_id: original.id,
  });

  await page.goto(`/transactions?month=${lastMonth()}`);
  await row(page, "Return Desk", "expense").getByRole("button", { name: /^Delete expense/ }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete this expense?" });
  await expect(confirm).toContainText("Its refunds stay, but they will no longer be linked to it.");
  await confirm.getByRole("button", { name: "Delete expense" }).click();
  await expect(row(page, "Return Desk", "expense")).toHaveCount(0);

  expect(await api.expense(refund.id)).toMatchObject({ amount_cents: -2000, refunded_expense_id: null });
  await page.goto(`/transactions?month=${thisMonth()}`);
  const r = row(page, "Return Desk", "refund");
  await expect(r.locator(".tx-table__amount")).toHaveText("−$20.00");
  await expect(r.locator(".pill")).toHaveText("Not linked");
  await expect(r.getByRole("button", { name: /^Link refund/ })).toBeVisible();
});

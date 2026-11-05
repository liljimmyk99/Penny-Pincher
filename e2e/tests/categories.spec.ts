/** M1 gate · Categories & sources (#23), re-checked on the real stack. */
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { monthOf, todayIn } from "../support/dates";

const today = () => todayIn(undefined);
const categoriesTable = (page: Page) => page.getByRole("table", { name: "Expense categories" });
const sourcesTable = (page: Page) => page.getByRole("table", { name: "Income sources" });
const names = (table: ReturnType<typeof categoriesTable>) => table.locator("tbody .manage-table__label").evaluateAll(
  (els) => els.map((el) => el.firstChild?.textContent?.trim() ?? ""),
);

async function openCategories(page: Page) {
  await page.goto("/categories");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(categoriesTable(page).locator("tbody tr")).toHaveCount(8);
}

test("reordering persists across a reload", async ({ signedIn: page, api }) => {
  await openCategories(page);
  const before = await names(categoriesTable(page));
  expect(before).toEqual(["Saving", "Housing", "Utilities", "Food", "Transportation", "Entertainment", "Debt", "Other"]);

  // Keyboard reorder: the handle moves its row with the arrow keys.
  const order = page.waitForResponse((r) => r.url().includes("/v1/categories/order") && r.ok());
  await categoriesTable(page).getByRole("button", { name: "Reorder Housing" }).press("ArrowDown");
  await order;
  const moved = ["Saving", "Utilities", "Housing", "Food", "Transportation", "Entertainment", "Debt", "Other"];
  expect(await names(categoriesTable(page))).toEqual(moved);

  await page.reload();
  await expect(categoriesTable(page).locator("tbody tr")).toHaveCount(8);
  expect(await names(categoriesTable(page))).toEqual(moved);
  expect((await api.categories()).sort((a, b) => a.sort_order - b.sort_order).map((c) => c.name)).toEqual(moved);
});

test('"Other" can be recolored but not renamed or deleted', async ({ signedIn: page, api }) => {
  await openCategories(page);
  const other = categoriesTable(page).locator("tbody tr").filter({ hasText: "Other" });
  await expect(other).toContainText("Locked");
  await expect(other.getByRole("button", { name: "Rename Other" })).toHaveCount(0);
  await expect(other.getByRole("button", { name: "Delete Other" })).toHaveCount(0);

  // The web screen has no colour control yet, so recolouring is checked on the API.
  const { id } = await api.category("Other");
  const recolor = await api.raw("PATCH", `/v1/categories/${id}`, { color: "#2F80ED" });
  expect(recolor.status()).toBe(200);
  expect((await api.category("Other")).color.toUpperCase()).toBe("#2F80ED");
  expect((await api.raw("PATCH", `/v1/categories/${id}`, { name: "Misc" })).status()).toBeGreaterThanOrEqual(400);
  expect((await api.raw("DELETE", `/v1/categories/${id}`)).status()).toBeGreaterThanOrEqual(400);
  expect((await api.category("Other")).is_protected).toBe(true);
});

test('deleting a category moves its expenses to "Other"', async ({ signedIn: page, api }) => {
  const e1 = await api.createExpense({ date: today(), amount_cents: 5000, category: "Debt", merchant: "Card Payment" });
  const e2 = await api.createExpense({ date: today(), amount_cents: -1000, category: "Debt", merchant: "Card Payment" });
  await openCategories(page);

  await categoriesTable(page).getByRole("button", { name: "Delete Debt" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Debt");
  await confirm.getByRole("button", { name: "Delete and move to Other" }).click();
  await expect(categoriesTable(page).locator("tbody tr")).toHaveCount(7);

  const other = await api.category("Other");
  expect((await api.expense(e1.id)).category_id).toBe(other.id);
  expect((await api.expense(e2.id)).category_id).toBe(other.id);
  expect(await api.expenses(monthOf(today()))).toHaveLength(2); // nothing deleted
});

test("a source with entries can be renamed but not deleted", async ({ signedIn: page, api }) => {
  const source = await api.createSource("Side Gig");
  await api.createIncome({ date: today(), source, gross: 10000, taxable: 10000, net: 9000 });
  await api.createSource("Unused Source");
  await page.goto("/categories");
  const table = sourcesTable(page);
  await expect(table.locator("tbody tr")).toHaveCount(3);

  const row = table.locator("tbody tr").filter({ hasText: "Side Gig" });
  await expect(row.getByRole("button", { name: "Delete Side Gig" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Why Side Gig can't be deleted" })).toBeVisible();
  expect((await api.raw("DELETE", `/v1/income-sources/${source.id}`)).status()).toBeGreaterThanOrEqual(400);
  // A source without entries can still be deleted.
  await expect(table.getByRole("button", { name: "Delete Unused Source" })).toBeVisible();

  await row.getByRole("button", { name: "Rename Side Gig" }).click();
  const input = table.getByLabel("Source name");
  await input.fill("Weekend Gig");
  await input.press("Enter");
  await expect(table.locator("tbody tr").filter({ hasText: "Weekend Gig" })).toHaveCount(1);
  await page.reload();
  await expect(sourcesTable(page).locator("tbody tr").filter({ hasText: "Weekend Gig" })).toHaveCount(1);
  expect((await api.sources()).find((s) => s.id === source.id)?.name).toBe("Weekend Gig");
});

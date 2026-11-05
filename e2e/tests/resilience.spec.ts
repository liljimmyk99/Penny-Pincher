/**
 * M1 gate · Across the whole app: the API going away and coming back.
 * Runs last (its own Playwright project) because it stops the API container.
 */
import { request } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { monthOf, todayIn } from "../support/dates";
import { BASE_URL, compose } from "../support/stack";

const today = () => todayIn(undefined);

async function waitForApi() {
  const ctx = await request.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true });
  try {
    for (let i = 0; i < 60; i++) {
      const ok = await ctx.get("/healthz").then((r) => r.ok(), () => false);
      if (ok) return;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("API did not come back");
  } finally {
    await ctx.dispose();
  }
}

test("with the API stopped, saving fails clearly; after a restart every earlier entry is still there", async ({
  signedIn: page,
  api,
}) => {
  test.setTimeout(180_000);
  const month = monthOf(today());
  const kept = await api.createExpense({ date: today(), amount_cents: 1234, category: "Food", merchant: "Before Outage" });
  const source = (await api.sources()).find((s) => s.name === "Other")!;
  await api.createIncome({ date: today(), source, gross: 50000, taxable: 50000, net: 40000, note: "Before outage" });

  await page.goto(`/add?month=${month}`);
  await expect(page.getByRole("heading", { level: 1, name: "Add entries" })).toBeVisible();
  await page.getByRole("combobox", { name: "Merchant, row 1" }).fill("During Outage");
  await page.getByRole("combobox", { name: "Merchant, row 1" }).press("Escape");
  await page.getByLabel("Category, row 1").selectOption({ label: "Food" });
  await page.getByLabel("Amount, row 1", { exact: true }).fill("99.99");

  compose("stop", "api");
  try {
    await page.getByRole("button", { name: "Save entry" }).click();
    const expenses = page.getByRole("region", { name: "Expenses" });
    await expect(expenses.getByRole("alert")).toContainText("Nothing was saved.");
    // Nothing pretends to be saved: no "Saved" status, and the row is still there to retry.
    await expect(expenses.locator(".entry-card__saved")).toHaveText("");
    await expect(page.getByRole("combobox", { name: "Merchant, row 1" })).toHaveValue("During Outage");
    await expect(page.getByLabel("Amount, row 1", { exact: true })).toHaveValue("99.99");

    // Income fails the same way.
    const income = page.getByRole("region", { name: "Income" });
    await income.getByLabel("Gross", { exact: true }).fill("10");
    await income.getByLabel("Gross taxable").fill("10");
    await income.getByLabel("Net", { exact: true }).fill("10");
    await income.getByRole("button", { name: "Save income" }).click();
    await expect(income.getByRole("alert")).toContainText("Nothing was saved.");
  } finally {
    compose("start", "api");
    await waitForApi();
  }

  // Back up: the earlier data survived the restart, and the failed save never landed.
  await page.goto(`/transactions?month=${month}`);
  await expect(page.getByText("Before Outage").first()).toBeVisible();
  await expect(page.getByText("During Outage")).toHaveCount(0);
  expect((await api.expense(kept.id)).amount_cents).toBe(1234);
  expect((await api.expenses(month)).map((e) => e.merchant.name)).toEqual(["Before Outage"]);
  expect((await api.income(month)).map((e) => e.net_cents)).toEqual([40000]);
});

/** M1 gate · Across the whole app: tenancy, the allowlist, and dark mode. */
import AxeBuilder from "@axe-core/playwright";
import { expect, signIn, test } from "../support/fixtures";
import { monthOf, todayIn } from "../support/dates";
import { Api, allowlist, createAccount } from "../support/stack";

const today = () => todayIn(undefined);

test("a second allowlisted user sees none of the first user's data and gets their own defaults", async ({
  page,
  api: first,
}) => {
  const theirs = await first.createExpense({ date: today(), amount_cents: 4242, category: "Food", merchant: "First User Shop" });
  await first.createSource("First User Job");

  const account = await createAccount("second");
  allowlist(account); // the admin CLI: `api user add --uid ...`
  const second = await Api.as(account);
  try {
    await signIn(page, account, `/transactions?month=${monthOf(today())}`);
    await expect(page.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();
    await expect(page.getByText(/No expenses logged in/)).toBeVisible();
    await expect(page.getByText("First User Shop")).toHaveCount(0);

    await page.goto("/categories");
    const categories = page.getByRole("table", { name: "Expense categories" }).locator("tbody tr");
    await expect(categories).toHaveCount(8);
    await expect(page.getByRole("table", { name: "Income sources" }).locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("table", { name: "Income sources" })).toContainText("Other");

    // And through the API: their own seeded rows, nothing of the first user's.
    expect((await second.categories()).map((c) => c.name)).toEqual([
      "Saving", "Housing", "Utilities", "Food", "Transportation", "Entertainment", "Debt", "Other",
    ]);
    expect((await second.categories()).find((c) => c.name === "Saving")?.is_saving).toBe(true);
    expect((await second.sources()).map((s) => s.name)).toEqual(["Other"]);
    expect(await second.expenses(monthOf(today()))).toHaveLength(0);
    expect(await second.merchants()).toHaveLength(0);
    expect((await second.raw("GET", `/v1/expenses/${theirs.id}`)).status()).toBe(404);
    expect((await second.raw("DELETE", `/v1/expenses/${theirs.id}`)).status()).toBe(404);
    expect((await first.expense(theirs.id)).amount_cents).toBe(4242);
  } finally {
    await second.dispose();
  }
});

test('a Firebase account that is not on the allowlist sees "No access"', async ({ page }) => {
  const stranger = await createAccount("stranger"); // exists in Firebase, never added with the CLI
  await signIn(page, stranger);
  await expect(page.getByRole("alert")).toContainText("No access.");
  await expect(page.getByRole("alert")).toContainText(stranger.email);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();

  const api = await Api.as(stranger);
  try {
    expect((await api.raw("GET", "/v1/me")).status()).toBe(403);
  } finally {
    await api.dispose();
  }
});

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });

  for (const path of ["/add", "/transactions", "/categories"]) {
    test(`${path} renders dark and passes the colour-contrast check`, async ({ signedIn: page, api }, testInfo) => {
      // Something on every screen, refunds included, so their styles are checked too.
      const e = await api.createExpense({ date: today(), amount_cents: 2000, category: "Food", merchant: "Dark Mode Shop" });
      await api.createExpense({ date: today(), amount_cents: -500, category: "Food", merchant: "Dark Mode Shop", refunded_expense_id: e.id });
      await api.createExpense({ date: today(), amount_cents: 3000, category: "Saving", merchant: "Savings Account" });
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");

      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const [r, g, b] = background.match(/\d+/g)!.map(Number);
      expect(0.2126 * r + 0.7152 * g + 0.0722 * b, `body background ${background} should be dark`).toBeLessThan(60);

      await testInfo.attach(`dark ${path}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
      const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")}: ${n.failureSummary}`));
      expect(problems, "colour-contrast violations in dark mode").toEqual([]);
    });
  }
});

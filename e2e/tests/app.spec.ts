/** M1 gate · Across the whole app: tenancy and dark mode. */
import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { expect, signIn, submitSignIn, test } from "../support/fixtures";
import { monthOf, todayIn } from "../support/dates";
import { Api, createAccount } from "../support/stack";

const today = () => todayIn(undefined);

test("a second user sees none of the first user's data and gets their own defaults", async ({
  page,
  api: first,
}) => {
  const theirs = await first.createExpense({ date: today(), amount_cents: 4242, category: "Food", merchant: "First User Shop" });
  await first.createSource("First User Job");

  const account = createAccount("second"); // the admin CLI: `api user add --username ...`
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

/** The page is dark and has no colour-contrast violations. */
async function expectDarkAndReadable(page: Page, testInfo: TestInfo, label: string) {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForLoadState("networkidle");

  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const [r, g, b] = background.match(/\d+/g)!.map(Number);
  expect(0.2126 * r + 0.7152 * g + 0.0722 * b, `body background ${background} should be dark`).toBeLessThan(60);

  await testInfo.attach(`dark ${label}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const problems = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")}: ${n.failureSummary}`));
  expect(problems, "colour-contrast violations in dark mode").toEqual([]);
}

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });

  for (const path of ["/add", "/transactions", "/categories"]) {
    test(`${path} renders dark and passes the colour-contrast check`, async ({ signedIn: page, api }, testInfo) => {
      // Something on every screen, refunds included, so their styles are checked too.
      const e = await api.createExpense({ date: today(), amount_cents: 2000, category: "Food", merchant: "Dark Mode Shop" });
      await api.createExpense({ date: today(), amount_cents: -500, category: "Food", merchant: "Dark Mode Shop", refunded_expense_id: e.id });
      await api.createExpense({ date: today(), amount_cents: 3000, category: "Saving", merchant: "Savings Account" });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectDarkAndReadable(page, testInfo, path);
    });
  }

  test("the sign-in screen, with its error, renders dark and passes the colour-contrast check", async ({ page, account }, testInfo) => {
    await page.goto("/");
    await submitSignIn(page, account.username, "not-the-password");
    await expect(page.getByRole("alert")).toContainText("Wrong username or password");
    await expectDarkAndReadable(page, testInfo, "sign-in");
  });

  test("the Change password screen renders dark and passes the colour-contrast check", async ({ page }, testInfo) => {
    const account = createAccount("dark-change", { mustChange: true });
    await signIn(page, account);
    await expect(page.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill("short"); // one requirement met, two not, so both styles show
    await expectDarkAndReadable(page, testInfo, "change password");
  });

  test("the account menu's Change password dialog renders dark and passes the colour-contrast check", async ({
    signedIn: page,
  }, testInfo) => {
    await page.getByRole("button", { name: /Member$/ }).click();
    await page.getByRole("menuitem", { name: "Change password" }).click();
    await expect(page.getByRole("dialog", { name: "Change password" })).toBeVisible();
    await expectDarkAndReadable(page, testInfo, "change password dialog");
  });
});

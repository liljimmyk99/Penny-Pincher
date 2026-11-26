/** M1 gate · Across the whole app: tenancy and dark mode. */
import { expect, signIn, submitSignIn, test } from "../support/fixtures";
import { monthOf, todayIn } from "../support/dates";
import { Api, createAccount } from "../support/stack";
import { expectDarkAndAccessible } from "../support/a11y";

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

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });

  for (const path of ["/add", "/transactions", "/categories"]) {
    test(`${path} renders dark and passes axe`, async ({ signedIn: page, api }, testInfo) => {
      // Something on every screen, refunds included, so their styles are checked too.
      const e = await api.createExpense({ date: today(), amount_cents: 2000, category: "Food", merchant: "Dark Mode Shop" });
      await api.createExpense({ date: today(), amount_cents: -500, category: "Food", merchant: "Dark Mode Shop", refunded_expense_id: e.id });
      await api.createExpense({ date: today(), amount_cents: 3000, category: "Saving", merchant: "Savings Account" });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectDarkAndAccessible(page, testInfo, path);
    });
  }

  test("the sign-in screen, with its error, renders dark and passes axe", async ({ page, account }, testInfo) => {
    await page.goto("/");
    await submitSignIn(page, account.username, "not-the-password");
    await expect(page.getByRole("alert")).toContainText("Wrong username or password");
    await expectDarkAndAccessible(page, testInfo, "sign-in");
  });

  test("the Change password screen renders dark and passes axe", async ({ page }, testInfo) => {
    const account = createAccount("dark-change", { mustChange: true });
    await signIn(page, account);
    await expect(page.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill("short"); // one requirement met, two not, so both styles show
    await expectDarkAndAccessible(page, testInfo, "change password");
  });

  test("the account menu's Change password dialog renders dark and passes axe", async ({
    signedIn: page,
  }, testInfo) => {
    await page.getByRole("button", { name: /Member$/ }).click();
    await page.getByRole("menuitem", { name: "Change password" }).click();
    await expect(page.getByRole("dialog", { name: "Change password" })).toBeVisible();
    await expectDarkAndAccessible(page, testInfo, "change password dialog");
  });
});

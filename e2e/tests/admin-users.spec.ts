/** Admin panel · Users tab (#157): an admin adds a user to the database, and that user signs in. */
import type { Page } from "@playwright/test";
import { expect, signIn, test } from "../support/fixtures";
import { monthOf, todayIn } from "../support/dates";
import { Api, allowlist, createAccount, type TestAccount } from "../support/stack";

/** The first admin still comes from the CLI; everyone after can be added from the panel. */
async function adminOnUsersTab(page: Page): Promise<TestAccount> {
  const admin = await createAccount("admin");
  allowlist(admin, "admin");
  await signIn(page, admin, "/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Admin dashboard" })).toBeVisible();
  await page.getByRole("tab", { name: "Users" }).click();
  await expect(page.getByRole("table", { name: "Users, oldest first" })).toBeVisible();
  return admin;
}

/** Fills and submits the Add user dialog. The caller checks what happens next. */
async function addUser(page: Page, user: { uid: string; email?: string; name?: string }) {
  await page.getByRole("button", { name: "Add user" }).click();
  const dialog = page.getByRole("dialog", { name: "Add user" });
  await dialog.getByLabel("Firebase uid").fill(user.uid);
  if (user.email) await dialog.getByLabel("Email (optional)").fill(user.email);
  if (user.name) await dialog.getByLabel("Display name (optional)").fill(user.name);
  await dialog.getByLabel("Role").selectOption("member");
  await dialog.getByRole("button", { name: "Add user" }).click();
  return dialog;
}

test("an admin adds a user from the panel, and that user signs in to a seeded, empty account", async ({
  page,
  browser,
}) => {
  // The "Firebase console" step: the account exists in the emulator, but not in the app's database.
  const added = await createAccount("added");
  const before = await Api.as(added);
  try {
    expect((await before.raw("GET", "/v1/me")).status()).toBe(403);
  } finally {
    await before.dispose();
  }

  await adminOnUsersTab(page);
  const dialog = await addUser(page, { uid: added.uid, email: added.email, name: "Added Person" });
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "User added" })).toBeVisible();
  const row = page.getByRole("table", { name: "Users, oldest first" }).locator("tbody tr").filter({ hasText: added.uid });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Added Person");
  await expect(row).toContainText(added.email);
  await expect(row).toContainText("Member");

  // The added person signs in, in their own browser session.
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const api = await Api.as(added);
  try {
    const theirs = await context.newPage();
    const month = monthOf(todayIn(undefined));
    await signIn(theirs, added, `/transactions?month=${month}`);
    await expect(theirs.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();
    await expect(theirs.getByText(/No expenses logged in/)).toBeVisible();

    await theirs.goto("/categories");
    await expect(theirs.getByRole("table", { name: "Expense categories" }).locator("tbody tr")).toHaveCount(8);
    await expect(theirs.getByRole("table", { name: "Income sources" }).locator("tbody tr")).toHaveCount(1);
    await expect(theirs.getByRole("table", { name: "Income sources" })).toContainText("Other");

    // And through the API: the seeded defaults, nothing else, and no admin rights.
    const categories = await api.categories();
    expect(categories.map((c) => c.name)).toEqual([
      "Saving", "Housing", "Utilities", "Food", "Transportation", "Entertainment", "Debt", "Other",
    ]);
    expect(categories.find((c) => c.name === "Saving")?.is_saving).toBe(true);
    expect(categories.find((c) => c.name === "Other")?.is_protected).toBe(true);
    expect((await api.sources()).map((s) => s.name)).toEqual(["Other"]);
    expect(await api.expenses(month)).toHaveLength(0);
    expect(await api.income(month)).toHaveLength(0);
    expect(await api.merchants()).toHaveLength(0);
    expect((await api.raw("GET", "/v1/admin/users")).status()).toBe(403);
  } finally {
    await api.dispose();
    await context.close();
  }
});

test("adding a uid that is already in the database shows the error and adds nothing", async ({ page }) => {
  const added = await createAccount("twice");
  await adminOnUsersTab(page);
  await expect(await addUser(page, { uid: added.uid, email: added.email })).toBeHidden();
  const rows = page.getByRole("table", { name: "Users, oldest first" }).locator("tbody tr").filter({ hasText: added.uid });
  await expect(rows).toHaveCount(1);

  const dialog = await addUser(page, { uid: added.uid, email: added.email });
  await expect(dialog.getByRole("alert")).toContainText("A user with this Firebase uid has already been added.");
  await expect(dialog).toBeVisible(); // still open, so the uid can be corrected
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(rows).toHaveCount(1);
});

test("a member does not see the admin panel", async ({ signedIn: page, api, account }) => {
  await page.getByRole("button", { name: /Member$/ }).click(); // the account button: name, then role
  const menu = page.getByRole("menu", { name: "Account" });
  await expect(menu.getByRole("menuitem", { name: /Sign out/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Admin dashboard/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Users" })).toHaveCount(0);

  // The API refuses too, so the gate isn't only in the UI.
  expect((await api.raw("GET", "/v1/admin/users")).status()).toBe(403);
  const stranger = await createAccount("not-added");
  const res = await api.raw("POST", "/v1/admin/users", { firebase_uid: stranger.uid, role: "admin" });
  expect(res.status()).toBe(403);
  expect((await api.raw("GET", "/v1/me")).ok()).toBe(true);
  expect(account.uid).not.toBe(stranger.uid);
  const theirs = await Api.as(stranger);
  try {
    expect((await theirs.raw("GET", "/v1/me")).status()).toBe(403); // nothing was added
  } finally {
    await theirs.dispose();
  }
});

/**
 * Admin panel · Users tab (#157, #190): an admin adds a user with an initial
 * password and that person signs in; an admin resets a password and the old
 * session stops working.
 */
import type { Locator, Page } from "@playwright/test";
import { expect, signIn, test } from "../support/fixtures";
import { monthOf, todayIn } from "../support/dates";
import { Api, createAccount, login, newPassword, newUsername, type TestAccount } from "../support/stack";

/** The first admin still comes from the CLI; everyone after can be added from the panel. */
async function adminOnUsersTab(page: Page): Promise<TestAccount> {
  const admin = createAccount("admin", { role: "admin" });
  await signIn(page, admin, "/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Admin dashboard" })).toBeVisible();
  await page.getByRole("tab", { name: "Users" }).click();
  await expect(usersTable(page)).toBeVisible();
  return admin;
}

const usersTable = (page: Page) => page.getByRole("table", { name: "Users, oldest first" });
const userRow = (page: Page, username: string) => usersTable(page).locator("tbody tr").filter({ hasText: username });

/** Fills and submits the Add user dialog. The caller checks what happens next. */
async function addUser(
  page: Page,
  user: { username: string; password: string; email?: string; name?: string; mustChange?: boolean },
): Promise<Locator> {
  await page.getByRole("button", { name: "Add user" }).click();
  const dialog = page.getByRole("dialog", { name: "Add user" });
  await dialog.getByLabel("Username", { exact: true }).fill(user.username);
  if (user.email) await dialog.getByLabel("Email (optional)").fill(user.email);
  if (user.name) await dialog.getByLabel("Display name (optional)").fill(user.name);
  await dialog.getByLabel("Role").selectOption("member");
  await dialog.getByLabel("Initial password").fill(user.password);
  const ask = dialog.getByLabel("Ask them to choose their own password");
  await expect(ask).toBeChecked(); // on by default
  if (user.mustChange === false) await ask.uncheck();
  await dialog.getByRole("button", { name: "Add user" }).click();
  return page.getByRole("dialog");
}

test("an admin adds a user from the panel, and that person signs in, chooses a password, and finds a seeded, empty account", async ({
  page,
  browser,
}) => {
  const added = { username: newUsername("added"), password: newPassword(), email: "added@example.test", name: "Added Person" };
  expect((await login(added.username, added.password)).status).toBe(401); // not a user yet

  await adminOnUsersTab(page);
  const dialog = await addUser(page, added);
  // The sign-in details, shown once.
  await expect(dialog.getByRole("heading", { name: "Sign-in details" })).toBeVisible();
  await expect(dialog).toContainText("User added. Pass these details on.");
  await expect(dialog).toContainText(added.username);
  await expect(dialog).toContainText(added.password);
  await expect(dialog).toContainText("They choose a new password");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();

  const row = userRow(page, added.username);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Added Person");
  await expect(row).toContainText(added.email);
  await expect(row).toContainText("Member");
  await expect(usersTable(page)).not.toContainText(added.password); // never shown again

  // The added person signs in, in their own browser session, and must choose a password first.
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const theirs = await context.newPage();
    const month = monthOf(todayIn(undefined));
    await signIn(theirs, added, `/transactions?month=${month}`);
    await expect(theirs.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
    const chosen = newPassword();
    await theirs.getByLabel("Temporary password").fill(added.password);
    await theirs.getByLabel("New password", { exact: true }).fill(chosen);
    await theirs.getByLabel("Repeat new password").fill(chosen);
    await theirs.getByRole("button", { name: "Change password" }).click();
    await expect(theirs.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();
    await expect(theirs.getByText(/No expenses logged in/)).toBeVisible();

    await theirs.goto("/categories");
    await expect(theirs.getByRole("table", { name: "Expense categories" }).locator("tbody tr")).toHaveCount(8);
    await expect(theirs.getByRole("table", { name: "Income sources" }).locator("tbody tr")).toHaveCount(1);
    await expect(theirs.getByRole("table", { name: "Income sources" })).toContainText("Other");

    // And through the API: the seeded defaults, nothing else, and no admin rights.
    const api = await Api.as({ username: added.username, password: chosen });
    try {
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
    }
  } finally {
    await context.close();
  }
});

test("a user added without 'choose their own' signs straight in with the initial password", async ({ page, browser }) => {
  const added = { username: newUsername("direct"), password: newPassword() };
  await adminOnUsersTab(page);
  const dialog = await addUser(page, { ...added, mustChange: false });
  await expect(dialog.getByRole("heading", { name: "Sign-in details" })).toBeVisible();
  await expect(dialog).not.toContainText("They choose a new password");
  await dialog.getByRole("button", { name: "Done" }).click();

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const theirs = await context.newPage();
    await signIn(theirs, added);
    await expect(theirs.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("adding a username that is already taken shows the error and adds nothing", async ({ page }) => {
  const taken = createAccount("taken");
  await adminOnUsersTab(page);
  const rows = userRow(page, taken.username);
  await expect(rows).toHaveCount(1);

  // Usernames are case-insensitive.
  const dialog = await addUser(page, { username: taken.username.toUpperCase(), password: newPassword() });
  await expect(dialog).toContainText("That username is already taken.");
  await expect(dialog.getByRole("heading", { name: "Add user" })).toBeVisible(); // still open, so it can be corrected
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(rows).toHaveCount(1);
  expect((await login(taken.username, taken.password)).status).toBe(200); // their password is untouched
});

test("an admin resets a password: the person's sessions stop working, and only the new password signs in", async ({
  page,
  browser,
}) => {
  const person = createAccount("reset");
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const theirApi = await Api.as(person);
  try {
    // They are signed in on another device (a browser) and through the API.
    const theirs = await context.newPage();
    await signIn(theirs, person);
    await expect(theirs.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();
    expect((await theirApi.raw("GET", "/v1/me")).status()).toBe(200);

    await adminOnUsersTab(page);
    await userRow(page, person.username).getByRole("button", { name: `Reset password for ${person.username}` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: `Set a new password for ${person.username}` })).toBeVisible();
    await dialog.getByRole("button", { name: "Generate" }).click();
    const field = dialog.getByLabel("New password");
    const generated = await field.inputValue();
    expect(generated.length).toBeGreaterThanOrEqual(12);
    await dialog.getByRole("button", { name: "Reset password" }).click();

    await expect(dialog.getByRole("heading", { name: "Sign-in details" })).toBeVisible();
    await expect(dialog).toContainText(`Password reset. ${person.username} was signed out everywhere.`);
    await expect(dialog).toContainText(generated);
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();
    await expect(userRow(page, person.username)).not.toContainText(generated);

    // Every session they had is gone.
    expect((await theirApi.raw("GET", "/v1/me")).status()).toBe(401);
    await theirs.reload();
    await expect(theirs.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(theirs.getByRole("alert")).toContainText("Your session has expired. Please sign in again.");

    // The old password no longer works; the new one does, and asks them to choose their own.
    expect((await login(person.username, person.password)).status).toBe(401);
    await signIn(theirs, { username: person.username, password: generated });
    await expect(theirs.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
  } finally {
    await theirApi.dispose();
    await context.close();
  }
});

test("a member does not see the admin panel", async ({ signedIn: page, api }) => {
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
  const stranger = { username: newUsername("not-added"), password: newPassword() };
  const res = await api.raw("POST", "/v1/admin/users", { ...stranger, role: "admin" });
  expect(res.status()).toBe(403);
  expect((await api.raw("GET", "/v1/me")).ok()).toBe(true);
  expect((await login(stranger.username, stranger.password)).status).toBe(401); // nothing was added
});

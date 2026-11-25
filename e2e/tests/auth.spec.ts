/**
 * Username and password sign-in (#182, #192): the generic error, the forced
 * Change password at first sign-in, changing a password signing out other
 * sessions, session expiry and the sign-in lock-out.
 * Adding users and admin resets are in admin-users.spec.ts.
 */
import type { Page } from "@playwright/test";
import { expect, pageToken, signIn, submitSignIn, test, TOKEN_KEY } from "../support/fixtures";
import { ageSession, Api, createAccount, login, newPassword, newUsername } from "../support/stack";

/** Fills the Change password form (the forced screen or the account-menu dialog) and submits it. */
async function changePassword(page: Page, currentLabel: string, current: string, next: string) {
  await page.getByLabel(currentLabel).fill(current);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Repeat new password").fill(next);
  await page.getByRole("button", { name: "Change password" }).click();
}

test("a wrong password and an unknown username get the same generic error", async ({ page, account }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Accounts are created and passwords are reset by an admin.")).toBeVisible();
  await expect(page.getByRole("button", { name: /google/i })).toHaveCount(0);
  await expect(page.getByText(/forgot password\?/i)).toHaveCount(0); // no reset email, only the admin note

  await submitSignIn(page, account.username, "not-the-password");
  await expect(page.getByRole("alert")).toHaveText("Wrong username or password. Check both and try again.");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("aria-invalid", "true");

  await submitSignIn(page, newUsername("nobody"), "not-the-password");
  await expect(page.getByRole("alert")).toHaveText("Wrong username or password. Check both and try again.");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();

  // The API can't be told apart either: same status, code and message.
  const wrongPassword = await login(account.username, "not-the-password");
  const unknownUser = await login(newUsername("nobody"), "not-the-password");
  expect(wrongPassword.status).toBe(401);
  expect(unknownUser.status).toBe(401);
  expect(unknownUser.body).toEqual(wrongPassword.body);
  expect(wrongPassword.body).toMatchObject({ error: { code: "invalid_credentials" } });

  // Usernames are case-insensitive; the right password gets in.
  await submitSignIn(page, account.username.toUpperCase(), account.password);
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Sign in");
  await expect(page.getByRole("button", { name: /Member$/ })).toBeVisible();
});

test("a user whose password an admin set must choose their own before anything else works", async ({ page }) => {
  const account = createAccount("forced", { mustChange: true });
  await signIn(page, account, "/summary");
  await expect(page.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0); // no sidebar or anything else to reach
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();

  // The API agrees: only me, change password and sign out until then.
  const token = await pageToken(page);
  const api = await Api.withToken(token);
  try {
    const refused = await api.raw("GET", "/v1/categories");
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toMatchObject({ error: { code: "password_change_required" } });
    expect((await api.raw("GET", "/v1/me")).status()).toBe(200);
  } finally {
    await api.dispose();
  }

  // The checklist keeps the button off until every rule is met; a wrong temporary password is refused.
  const chosen = newPassword();
  await page.getByLabel("Temporary password").fill(account.password);
  await page.getByLabel("New password", { exact: true }).fill("too-short");
  await page.getByLabel("Repeat new password").fill("too-short");
  await expect(page.getByRole("button", { name: "Change password" })).toBeDisabled();
  await changePassword(page, "Temporary password", "not-the-password", chosen);
  await expect(page.getByText("That isn't your current password.")).toBeVisible();

  await changePassword(page, "Temporary password", account.password, chosen);
  await expect(page.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();

  // The page got a fresh token; the one it had stopped working. Only the new password signs in now.
  const fresh = await Api.withToken(await pageToken(page));
  const stale = await Api.withToken(token);
  try {
    expect((await fresh.raw("GET", "/v1/categories")).status()).toBe(200);
    expect((await stale.raw("GET", "/v1/me")).status()).toBe(401);
  } finally {
    await fresh.dispose();
    await stale.dispose();
  }
  expect((await login(account.username, account.password)).status).toBe(401);
  expect(await login(account.username, chosen)).toMatchObject({ status: 200, body: { must_change_password: false } });
});

test("signing out ends that session only", async ({ signedIn: page, account }) => {
  const other = await Api.as(account); // another device
  const token = await pageToken(page);
  try {
    await page.getByRole("button", { name: /Member$/ }).click();
    await page.getByRole("menuitem", { name: /Sign out/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0); // a plain sign-out has no notice

    const signedOut = await Api.withToken(token);
    try {
      expect((await signedOut.raw("GET", "/v1/me")).status()).toBe(401);
    } finally {
      await signedOut.dispose();
    }
    expect((await other.raw("GET", "/v1/me")).status()).toBe(200);
  } finally {
    await other.dispose();
  }
});

test("changing your password from the account menu signs out your other sessions", async ({
  signedIn: page,
  account,
  browser,
}) => {
  // The same person on a second device.
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const otherApi = await Api.as(account);
  try {
    const elsewhere = await context.newPage();
    await signIn(elsewhere, account);
    await expect(elsewhere.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();

    const chosen = newPassword();
    await page.getByRole("button", { name: /Member$/ }).click();
    await page.getByRole("menuitem", { name: "Change password" }).click();
    const dialog = page.getByRole("dialog", { name: "Change password" });
    await expect(dialog).toContainText("Changing your password signs you out on your other devices.");
    await dialog.getByLabel("Current password").fill(account.password);
    await dialog.getByLabel("New password", { exact: true }).fill(chosen);
    await dialog.getByLabel("Repeat new password").fill(chosen);
    await dialog.getByRole("button", { name: "Change password" }).click();
    await expect(dialog).toBeHidden();

    // This device stays signed in, on its fresh token.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();

    // The other device and the other API session are signed out.
    expect((await otherApi.raw("GET", "/v1/me")).status()).toBe(401);
    await elsewhere.reload();
    await expect(elsewhere.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(elsewhere.getByRole("alert")).toContainText("Your session has expired. Please sign in again.");
    await signIn(elsewhere, { username: account.username, password: chosen });
    await expect(elsewhere.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();

    expect((await login(account.username, account.password)).status).toBe(401);
  } finally {
    await otherApi.dispose();
    await context.close();
  }
});

test("a session older than 30 days is refused and the app asks to sign in again", async ({ signedIn: page }) => {
  const token = await pageToken(page);
  ageSession(token, 31);

  const api = await Api.withToken(token);
  try {
    const res = await api.raw("GET", "/v1/me");
    expect(res.status()).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "session_expired" } });
  } finally {
    await api.dispose();
  }

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("Your session has expired. Please sign in again.");
  expect(await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY)).toBeNull(); // the stale token is dropped
});

test("10 wrong passwords in a row lock the username, even for the right password", async ({ page }) => {
  // Its own user, so the 15-minute lock-out touches nothing else.
  const account = createAccount("locked");
  for (let i = 0; i < 10; i++) expect((await login(account.username, `wrong-${i}`)).status).toBe(401);

  const locked = await login(account.username, account.password);
  expect(locked.status).toBe(429);
  expect(locked.body).toMatchObject({ error: { code: "rate_limited" } });
  expect(Number(locked.headers["retry-after"])).toBeGreaterThan(60);

  await signIn(page, account);
  await expect(page.getByRole("alert")).toHaveText("Too many attempts. Try again in a minute.");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();

  // Other usernames are not affected.
  const neighbour = createAccount("neighbour");
  expect((await login(neighbour.username, neighbour.password)).status).toBe(200);
});

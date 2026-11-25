import { test as base, expect, type Page } from "@playwright/test";
import { Api, createAccount, type TestAccount } from "./stack";

/** Where the web app keeps its session token (web/src/auth/api.ts). */
export const TOKEN_KEY = "penny-pincher.session-token";

/** Fills and submits the real sign-in screen. The caller checks what happens next. */
export async function submitSignIn(page: Page, username: string, password: string) {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Opens `path` and signs in through the real sign-in screen with a username and password. */
export async function signIn(page: Page, account: Pick<TestAccount, "username" | "password">, path = "/transactions") {
  await page.goto(path);
  await submitSignIn(page, account.username, account.password);
}

/** The session token the page signed in with. */
export async function pageToken(page: Page): Promise<string> {
  const token = await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY);
  if (!token) throw new Error("the page has no session token");
  return token;
}

/** Every test gets its own user, made with the real CLI, so tests never see each other's data. */
export const test = base.extend<{ account: TestAccount; api: Api; signedIn: Page }>({
  account: async ({}, use) => {
    await use(createAccount());
  },
  api: async ({ account }, use) => {
    const api = await Api.as(account);
    await use(api);
    await api.dispose();
  },
  /** The page, signed in as `account` and showing Transactions. */
  signedIn: async ({ page, account }, use) => {
    await signIn(page, account);
    await expect(page.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();
    await use(page);
  },
});

export { expect };

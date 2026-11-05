import { test as base, expect, type Page } from "@playwright/test";
import { allowlist, Api, createAccount, type TestAccount } from "./stack";

/** Signs in through the real sign-in screen (email and password, against the emulator). */
export async function signIn(page: Page, account: TestAccount, path = "/transactions") {
  await page.goto(path);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Every test gets its own allowlisted user, so tests never see each other's data. */
export const test = base.extend<{ account: TestAccount; api: Api; signedIn: Page }>({
  account: async ({}, use) => {
    const account = await createAccount();
    allowlist(account);
    await use(account);
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

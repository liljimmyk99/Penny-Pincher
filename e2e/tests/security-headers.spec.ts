/**
 * #105 · Browser security headers from the public proxy (deploy/Caddyfile), and
 * a Content-Security-Policy the whole app runs under without a single violation.
 */
import { randomUUID } from "node:crypto";
import type { APIResponse, Frame, Page } from "@playwright/test";
import { request } from "@playwright/test";
import { expect, signIn, test } from "../support/fixtures";
import { monthOf, todayIn } from "../support/dates";
import { allowlist, Api, BASE_URL, createAccount, uidOf } from "../support/stack";

const today = () => todayIn(undefined);

// Runs as its own Playwright project on full Chromium (see playwright.config.ts).

const SAME_ON_EVERY_RESPONSE: Record<string, string> = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "cross-origin-opener-policy": "same-origin-allow-popups",
};

function parseCsp(header: string | undefined): Record<string, string[]> {
  expect(header, "Content-Security-Policy header").toBeTruthy();
  return Object.fromEntries(
    header!
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name, sources]),
  );
}

function expectSecurityHeaders(res: APIResponse) {
  const headers = res.headers();
  const where = `${res.status()} ${new URL(res.url()).pathname}`;
  for (const [name, value] of Object.entries(SAME_ON_EVERY_RESPONSE)) expect(headers[name], `${name} on ${where}`).toBe(value);
  expect(headers["server"], `Server on ${where}`).toBeUndefined();
  expect(headers["via"], `Via on ${where}`).toBeUndefined();

  const csp = parseCsp(headers["content-security-policy"]);
  expect(csp["default-src"]).toEqual(["'self'"]);
  // Only our own files and Google's popup loader: no inline script, no eval.
  expect(csp["script-src"]).toEqual(["'self'", "https://apis.google.com"]);
  expect(csp["object-src"]).toEqual(["'none'"]);
  expect(csp["base-uri"]).toEqual(["'self'"]);
  expect(csp["form-action"]).toEqual(["'self'"]);
  expect(csp["frame-ancestors"]).toEqual(["'none'"]);
  expect(csp["connect-src"]).toEqual(expect.arrayContaining(["'self'", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"]));
  expect(csp["frame-src"]).toContain("https://demo-penny-pincher.firebaseapp.com");
  expect(csp["style-src"]).toEqual(expect.arrayContaining(["'self'", "https://fonts.googleapis.com"]));
  expect(csp["font-src"]).toEqual(expect.arrayContaining(["https://fonts.gstatic.com"]));
  expect(headers["content-security-policy"], "nothing in the policy lets an injected script run").not.toMatch(/unsafe-eval|\*/);
  expect(csp["script-src"].join(" ")).not.toMatch(/unsafe-inline|data:/);
}

/** Every CSP violation the page reports, kept across navigations and reloads. */
// Google's iframe loader sometimes (it is sampled) sends a usage beacon to
// apis.google.com/js/gen_204. The policy blocks it on purpose: it is telemetry,
// not part of sign-in, and sign-in works without it. Nothing else is ignored.
const IGNORED_VIOLATION = /https:\/\/apis\.google\.com\/js\/gen_204\b/;

async function watchCsp(page: Page): Promise<string[]> {
  const violations: string[] = [];
  const record = (v: string) => {
    if (!IGNORED_VIOLATION.test(v)) violations.push(v);
  };
  await page.exposeFunction("__e2eCspViolation", record);
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      const report = (window as unknown as { __e2eCspViolation(v: string): void }).__e2eCspViolation;
      report(`${e.effectiveDirective} blocked ${e.blockedURI || "inline"} (${e.sourceFile || location.pathname}:${e.lineNumber})`);
    });
  });
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) record(m.text());
  });
  return violations;
}

test("every response carries the security headers; API responses are never cached", async ({ api }) => {
  const anonymous = await request.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true });
  try {
    const page = await anonymous.get("/");
    expectSecurityHeaders(page);
    // The pre-paint theme script is a file now, so the page has no inline script for the CSP to allow.
    const html = await page.text();
    expect(html).toContain('<script src="/theme-init.js"></script>');
    expect(html, "inline <script> in index.html").not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);

    const script = await anonymous.get("/theme-init.js");
    expect(script.status()).toBe(200);
    expect(script.headers()["content-type"]).toMatch(/javascript/);
    expectSecurityHeaders(script);

    expectSecurityHeaders(await anonymous.get("/transactions")); // an app route, served as index.html

    for (const res of [await anonymous.get("/healthz"), await anonymous.get("/v1/me")]) {
      expectSecurityHeaders(res);
      expect(res.headers()["cache-control"], new URL(res.url()).pathname).toBe("no-store");
    }
    expect((await anonymous.get("/v1/me")).status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }

  // Signed in, with financial data in the body.
  await api.createExpense({ date: today(), amount_cents: 1234, category: "Food", merchant: "Header Shop" });
  for (const path of ["/v1/me", `/v1/expenses?month=${monthOf(today())}`]) {
    const res = await api.raw("GET", path);
    expect(res.status(), path).toBe(200);
    expectSecurityHeaders(res);
    expect(res.headers()["cache-control"], path).toBe("no-store");
  }
});

test.describe("under the Content-Security-Policy", () => {
  test.use({ colorScheme: "dark" });

  test("email sign-in, the theme, fonts and every screen work with no CSP violations", async ({ page }) => {
    const violations = await watchCsp(page);
    const admin = await createAccount("csp-admin");
    allowlist(admin, "admin"); // so the admin panel is on the tour too
    const api = await Api.as(admin);
    try {
      const food = await api.createExpense({ date: today(), amount_cents: 2500, category: "Food", merchant: "Policy Grocer" });
      await api.createExpense({ date: today(), amount_cents: -500, category: "Food", merchant: "Policy Grocer", refunded_expense_id: food.id });
      await api.createExpense({ date: today(), amount_cents: 4000, category: "Saving", merchant: "Savings Account" });
      const source = await api.createSource("Policy Job");
      await api.createIncome({ date: today(), source, gross: 300000, taxable: 280000, net: 220000 });

      // theme-init.js ran before the app: dark, from the system preference.
      await page.goto("/summary");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await signIn(page, admin, "/summary");
      await expect(page.getByRole("heading", { level: 1, name: "Summary" })).toBeVisible();

      // The Google Fonts stylesheet and font files loaded (style-src and font-src).
      await page.waitForFunction(() =>
        [...document.fonts].some((f) => f.family.replace(/["']/g, "") === "Manrope" && f.status === "loaded"),
      );

      // Charts and dialogs: Radix menus and dialogs add their own styles while open.
      await page.getByRole("button", { name: "Donut", exact: true }).click();
      const bodyOverflow = () => page.evaluate(() => getComputedStyle(document.body).overflow);
      await page.getByRole("button", { name: /^Policy Job, / }).click();
      await expect(page.getByRole("dialog", { name: "Policy Job" })).toBeVisible();
      // The scroll lock's CSS still applies, as a constructed stylesheet (web/src/lib/cspStyleSingleton.ts).
      await expect.poll(bodyOverflow).toBe("hidden");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect.poll(bodyOverflow).not.toBe("hidden");

      await page.getByRole("button", { name: /Admin$/ }).click(); // the account button: name, then role
      await expect(page.getByRole("menu", { name: "Account" })).toBeVisible();
      await page.getByRole("menuitemradio", { name: "Light" }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await page.keyboard.press("Escape");

      await page.goto("/transactions");
      await page.getByRole("button", { name: /^Edit expense Policy Grocer/ }).click();
      await expect(page.getByRole("dialog", { name: "Edit expense" })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /^Delete expense Policy Grocer/ }).click();
      const confirm = page.getByRole("alertdialog", { name: "Delete this expense?" });
      await confirm.getByRole("button", { name: "Cancel" }).click();
      await expect(confirm).toBeHidden();

      // The rest of the screens, each waited on by a heading that shows once it has loaded.
      for (const [path, heading] of [
        ["/add", "Add entries"],
        ["/yearly", "Yearly"],
        ["/trends", "Trends"],
        ["/templates", "Your templates"],
        ["/categories", "Categories & sources"],
        ["/settings", "Settings"],
        ["/export", "Export data"],
        ["/admin", "Admin dashboard"],
        ["/nowhere", "Page not found"],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: heading, exact: true }), path).toBeVisible();
        await page.waitForLoadState("networkidle");
      }

      await page.goto("/summary");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light"); // the stored choice, before paint
      await page.evaluate(() => 0); // let any last report arrive
      expect(violations, "CSP violations").toEqual([]);
    } finally {
      await api.dispose();
    }
  });
});

test.describe("under the Content-Security-Policy, Google", () => {
  test.use({ colorScheme: "dark" });

  test("Google sign-in through the popup works with no CSP violations", async ({ page }) => {
    const violations = await watchCsp(page);
    await page.goto("/summary");

    // The emulator stands in for Google's account chooser in the popup. The SDK
    // still loads Google's iframe loader (script-src) and opens the auth iframe
    // (frame-src), so this exercises the same policy as real Google sign-in.
    const email = `google-${randomUUID().slice(0, 8)}@example.test`;
    const signInWithGoogle = async (pick: (popup: Page) => Promise<void>) => {
      const popupOpened = page.waitForEvent("popup");
      await page.getByRole("button", { name: "Continue with Google" }).click();
      const popup = await popupOpened;
      // A person takes long enough to pick an account; the test has to wait for
      // what that time covers. The emulator's chooser binds its buttons once its
      // scripts have loaded, and the popup hands its result to the SDK's hidden
      // auth iframe in this page, whose first script starts listening (and
      // buffers the result until the SDK is wired up).
      await popup.waitForLoadState("load");
      let authFrame: Frame | undefined;
      await expect
        .poll(() => (authFrame = page.frames().find((f) => f.url().includes("/emulator/auth/iframe"))))
        .toBeTruthy();
      await authFrame!.waitForLoadState("domcontentloaded");
      const closed = popup.waitForEvent("close");
      await pick(popup);
      await closed;
    };

    // A new Google account: Firebase signs it in, but it isn't allowlisted, so
    // the API answers 403 and the app signs it out again.
    await signInWithGoogle(async (popup) => {
      await popup.locator("#add-account-button").click();
      await popup.locator("#email-input").fill(email);
      await popup.locator("#display-name-input").fill("Google Test User");
      await popup.locator("#sign-in").click();
    });
    await expect(page.getByRole("alert")).toContainText("No access.");
    await expect(page.getByRole("alert")).toContainText(email);

    // Once an admin adds it, signing in with the same Google account gets in.
    allowlist({ uid: await uidOf(email), email });
    await signInWithGoogle((popup) => popup.locator("#accounts-list").getByText(email).click());
    await expect(page.getByRole("heading", { level: 1, name: "Summary" })).toBeVisible();

    await page.evaluate(() => 0);
    expect(violations, "CSP violations").toEqual([]);
  });
});

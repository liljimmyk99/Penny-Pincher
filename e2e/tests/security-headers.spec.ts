/**
 * #105 · Browser security headers from the public proxy (deploy/Caddyfile), and
 * a Content-Security-Policy the whole app runs under without a single violation.
 */
import type { APIResponse, Page } from "@playwright/test";
import { request } from "@playwright/test";
import { expect, signIn, submitSignIn, test } from "../support/fixtures";
import { monthOf, todayIn } from "../support/dates";
import { Api, BASE_URL, createAccount } from "../support/stack";

const today = () => todayIn(undefined);

// Runs as its own Playwright project (see playwright.config.ts).

const SAME_ON_EVERY_RESPONSE: Record<string, string> = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "cross-origin-opener-policy": "same-origin",
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
  // Only our own files: no inline script, no eval, and no third-party script.
  expect(csp["script-src"]).toEqual(["'self'"]);
  expect(csp["object-src"]).toEqual(["'none'"]);
  expect(csp["base-uri"]).toEqual(["'self'"]);
  expect(csp["form-action"]).toEqual(["'self'"]);
  expect(csp["frame-ancestors"]).toEqual(["'none'"]);
  // Sign-in is our own API now (#182): nothing to connect to or frame but ourselves.
  expect(csp["connect-src"]).toEqual(["'self'"]);
  expect(csp["frame-src"], "no frame-src, so default-src 'self' applies").toBeUndefined();
  expect(csp["style-src"]).toEqual(["'self'", "https://fonts.googleapis.com"]);
  expect(csp["font-src"]).toEqual(["'self'", "https://fonts.gstatic.com"]);
  expect(headers["content-security-policy"], "no Google sign-in or Firebase origin is left").not.toMatch(/firebase|apis\.google\.com|accounts\.google\.com|identitytoolkit|securetoken/);
  expect(headers["content-security-policy"], "nothing in the policy lets an injected script run").not.toMatch(/unsafe-eval|\*/);
  expect(csp["script-src"].join(" ")).not.toMatch(/unsafe-inline|data:/);
}

/** Every CSP violation the page reports, kept across navigations and reloads. */
async function watchCsp(page: Page): Promise<string[]> {
  const violations: string[] = [];
  const record = (v: string) => violations.push(v);
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

  test("sign-in, the theme, fonts and every screen work with no CSP violations", async ({ page }) => {
    const violations = await watchCsp(page);
    const admin = createAccount("csp-admin", { role: "admin" }); // so the admin panel is on the tour too
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
      // A failed attempt first, so the sign-in error is on the tour too.
      await submitSignIn(page, admin.username, "not-the-password");
      await expect(page.getByRole("alert")).toContainText("Wrong username or password");
      await signIn(page, admin, "/summary");
      await expect(page.getByRole("heading", { level: 1, name: "Summary" })).toBeVisible();

      // The Google Fonts stylesheet and font files loaded (style-src and font-src).
      await page.waitForFunction(() =>
        [...document.fonts].some((f) => f.family.replace(/["']/g, "") === "Geist" && f.status === "loaded"),
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

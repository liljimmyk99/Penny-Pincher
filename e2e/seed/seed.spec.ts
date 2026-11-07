/**
 * `npm run seed`: one demo account on the e2e stack that you can sign into,
 * with almost two years of generic, made-up data (see AGENTS.md in this
 * folder). Not part of the test suite; it has its own config
 * (playwright.seed.config.ts).
 *
 * Emulator-only credentials: the demo- project's Auth emulator accepts
 * nothing else, so these never work against real Firebase.
 */
import { test } from "@playwright/test";

import { Api, EMULATOR_URL, allowlist, type IncomeSource, type TestAccount } from "../support/stack";

const EMAIL = process.env.SEED_EMAIL ?? "demo@example.test";
const PASSWORD = process.env.SEED_PASSWORD ?? "demo-password-123";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

async function call<T>(api: Api, method: Method, path: string, data?: unknown): Promise<T> {
  const res = await api.raw(method, path, data);
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${await res.text()}`);
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

/** Makes the emulator account, or returns null when it already exists. */
async function signUp(): Promise<TestAccount | null> {
  const res = await fetch(`${EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  });
  if (!res.ok) {
    if ((await res.text()).includes("EMAIL_EXISTS")) return null;
    throw new Error(`emulator signUp failed: ${res.status}`);
  }
  const body = (await res.json()) as { localId: string };
  return { email: EMAIL, password: PASSWORD, uid: body.localId };
}

/* ---- deterministic made-up numbers ------------------------------------- */

/** mulberry32: the same seed always gives the same data. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(Math.min(d, daysIn(y, m)))}`;

interface Row { date: string; category: string; merchant: string; cents: number; note?: string }

/** One month of spending. `scale` grows a little each year so year over year has movement. */
function monthExpenses(y: number, m: number, scale: number): Row[] {
  const r = rng(y * 100 + m);
  const between = (lo: number, hi: number) => Math.round((lo + r() * (hi - lo)) * scale * 100);
  const day = () => 1 + Math.floor(r() * daysIn(y, m));
  const rows: Row[] = [];
  const add = (d: number, category: string, merchant: string, cents: number, note?: string) =>
    rows.push({ date: iso(y, m, d), category, merchant, cents, note });

  const winter = m === 12 || m <= 2;
  const summer = m >= 6 && m <= 8;

  add(1, "Housing", "Landlord", Math.round(1400 * scale) * 100, "Rent");
  add(12, "Utilities", "Power Company", between(summer || winter ? 110 : 70, summer || winter ? 160 : 95));
  add(18, "Utilities", "Water Utility", between(35, 50));
  add(20, "Utilities", "Internet Provider", 6500);
  for (const d of [3, 10, 17, 24]) add(d, "Food", "Grocer", between(70, m === 12 ? 190 : 140));
  for (let i = 0; i < 6; i++) add(day(), "Food", "Corner Cafe", between(4, 9), i % 2 ? undefined : "lunch");
  for (let i = 0; i < 2; i++) add(day(), "Food", "Pizza Place", between(22, 45));
  for (let i = 0; i < 3; i++) add(day(), "Transportation", "Gas Station", between(35, 58));
  add(2, "Transportation", "Transit Pass", 8000);
  add(5, "Entertainment", "Streaming Service", 1549);
  if (r() < 0.6) add(day(), "Entertainment", "Cinema", between(18, 36));
  if (r() < 0.4) add(day(), "Entertainment", "Bookshop", between(12, 40));
  add(25, "Debt", "Card Payment", 20000);
  add(16, "Saving", "Brokerage", 50000);
  add(28, "Saving", "Savings Account", m === 12 ? 10000 : 30000);
  if (r() < 0.35) add(day(), "Other", "Hardware Store", between(15, 80));
  if (m === 12) {
    add(8, "Other", "Department Store", between(120, 180), "birthday gift");
    add(14, "Other", "Department Store", between(90, 150));
  }
  return rows;
}

test("seed the demo account", async () => {
  test.setTimeout(10 * 60_000);
  const account = await signUp();
  if (!account) {
    console.log(`\n${EMAIL} already exists, so nothing was added. To start over: npm run stack:down, then npm run seed.\n`);
    return;
  }
  allowlist(account, "admin");
  const api = await Api.as(account);

  try {
    const categories = await api.categories();
    const categoryId = (name: string) => {
      const c = categories.find((x) => x.name === name);
      if (!c) throw new Error(`no category ${name}`);
      return c.id;
    };
    const salary = await api.createSource("Salary");
    const freelance = await api.createSource("Freelance");
    const other = (await api.sources()).find((s) => s.is_protected) as IncomeSource;

    const today = new Date();
    const [ty, tm, td] = [today.getFullYear(), today.getMonth() + 1, today.getDate()];
    const thisMonth = `${ty}-${pad(tm)}`;

    // The current month starts from a template, so its bills show as
    // unconfirmed copies with the banner, the way a real month would.
    const { items: templates } = await call<{ items: { id: string }[] }>(api, "GET", "/v1/templates");
    const tpl = templates[0] ?? (await call<{ id: string }>(api, "POST", "/v1/templates", { name: "Typical month" }));
    await call(api, "PATCH", `/v1/templates/${tpl.id}`, { name: "Typical month" });
    const fixed: [string, string, number, number, string?][] = [
      ["Housing", "Landlord", 1, 147000, "Rent"],
      ["Utilities", "Internet Provider", 20, 6500],
      ["Transportation", "Transit Pass", 2, 8000],
      ["Entertainment", "Streaming Service", 5, 1549],
      ["Debt", "Card Payment", 25, 20000],
      ["Saving", "Brokerage", 16, 50000],
      ["Saving", "Savings Account", 28, 30000],
    ];
    for (const [cat, merchant, day, cents, note] of fixed) {
      await call(api, "POST", `/v1/templates/${tpl.id}/expense-items`, {
        category_id: categoryId(cat), merchant_name: merchant, day_of_month: day, amount_cents: cents, note: note ?? null,
      });
    }
    for (const day of [1, 15]) {
      await call(api, "POST", `/v1/templates/${tpl.id}/income-items`, {
        income_source_id: salary.id, day_of_month: day, gross_cents: 315000, gross_taxable_cents: 286000, net_cents: 230000,
      });
    }
    await call(api, "POST", `/v1/months/${thisMonth}/apply-template`, { template_id: tpl.id });

    // January of last year up to today.
    let gifts: string[] = [];
    let count = 0;
    for (let y = ty - 1, m = 1; y < ty || (y === ty && m <= tm); m === 12 ? (y++, (m = 1)) : m++) {
      const current = y === ty && m === tm;
      const scale = y === ty ? 1.05 : 1;
      let rows = monthExpenses(y, m, scale);
      if (current) {
        // Bills come from the template; keep only day-to-day spending so far.
        rows = rows.filter((r) => ["Food", "Other"].includes(r.category) || ["Gas Station", "Cinema", "Bookshop"].includes(r.merchant));
        rows = rows.filter((r) => Number(r.date.slice(8)) <= td);
      }
      if (rows.length) {
        const { items } = await call<{ items: { id: string; merchant: { name: string } }[] }>(api, "POST", "/v1/expenses/batch", {
          items: rows.map((r) => ({
            date: r.date, amount_cents: r.cents, category_id: categoryId(r.category), merchant_name: r.merchant, note: r.note ?? null,
          })),
        });
        count += items.length;
        // Refunds land in January for December's gifts: one full, one partial.
        if (m === 1 && gifts.length === 2 && (!current || td >= 9)) {
          const [full, partial] = await Promise.all(gifts.map((id) => api.expense(id)));
          await api.createExpense({ date: iso(y, 1, 6), amount_cents: -full.amount_cents, category: "Other", merchant: "Department Store", note: "returned", refunded_expense_id: full.id });
          await api.createExpense({ date: iso(y, 1, 9), amount_cents: -Math.round(partial.amount_cents / 3), category: "Other", merchant: "Department Store", note: "price adjustment", refunded_expense_id: partial.id });
          count += 2;
        }
        gifts = m === 12 ? items.filter((e) => e.merchant.name === "Department Store").map((e) => e.id) : [];
      }

      if (!current) {
        const [gross, taxable, net] = y === ty ? [315000, 286000, 230000] : [300000, 273000, 221000];
        for (const d of [1, 15]) await api.createIncome({ date: iso(y, m, d), source: salary, gross, taxable, net });
        if (m % 3 === 1) {
          const fee = Math.round((400 + rng(y * 31 + m)() * 500) * 100);
          await api.createIncome({ date: iso(y, m, 22), source: freelance, gross: fee, taxable: fee, net: fee, note: "client project" });
        }
        if (m === 6) await api.createIncome({ date: iso(y, m, 14), source: other, gross: 25000, taxable: 0, net: 25000, note: "one-off job" });
      }
    }

    const merchants = await api.merchants();
    const cafe = merchants.find((x) => x.name === "Corner Cafe");
    await call(api, "POST", "/v1/saved-trends", { name: "Coffee visits", match_type: "merchant", merchant_id: cafe?.id, measure: "count" });
    await call(api, "POST", "/v1/saved-trends", { name: "Food spending", match_type: "category", category_id: categoryId("Food"), measure: "amount" });
    await call(api, "POST", "/v1/saved-trends", { name: "Lunches", match_type: "note", match_text: "lunch", measure: "amount" });

    console.log(
      `\nSeeded ${count} expenses, income, a template and 3 saved trends from January ${ty - 1} to today.\n` +
        `Sign in at https://localhost:18443 as ${EMAIL} / ${PASSWORD} (admin).\n`,
    );
  } finally {
    await api.dispose();
  }
});

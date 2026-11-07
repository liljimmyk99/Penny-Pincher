/**
 * The pieces of the e2e stack (compose.yml) that tests drive directly:
 * Firebase Auth emulator accounts, the API's `user add` CLI (the allowlist),
 * and an API client for arranging and checking data.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { request, type APIRequestContext } from "@playwright/test";

export const BASE_URL = "https://localhost:18443";
export const EMULATOR_URL = "http://localhost:19099";
export const PROJECT_ID = "demo-penny-pincher";
const E2E_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

/** `docker compose ...` for this stack (project pp-e2e). */
export function compose(...args: string[]): string {
  return execFileSync("docker", ["compose", ...args], { cwd: E2E_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export interface TestAccount {
  email: string;
  password: string;
  uid: string;
}

/** A Firebase account in the emulator, with generated test credentials. */
export async function createAccount(label = "user"): Promise<TestAccount> {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${randomUUID()}`;
  const res = await fetch(`${EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`emulator signUp failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { localId: string };
  return { email, password, uid: body.localId };
}

/** Adds the account to the API's users table, the way an admin does in v1. */
export function allowlist(account: Pick<TestAccount, "uid" | "email">, role: "admin" | "member" = "member"): void {
  compose("exec", "-T", "api", "/api", "user", "add", "--uid", account.uid, "--email", account.email, "--role", role);
}

/** The uid of an emulator account made somewhere else (the Google popup), by its email. */
export async function uidOf(email: string): Promise<string> {
  const res = await fetch(`${EMULATOR_URL}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`, {
    method: "POST",
    // The emulator accepts "owner" as admin credentials.
    headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify({ email: [email] }),
  });
  if (!res.ok) throw new Error(`emulator lookup failed: ${res.status} ${await res.text()}`);
  const users = ((await res.json()) as { users?: { localId: string }[] }).users ?? [];
  if (users.length !== 1) throw new Error(`expected one emulator account for ${email}, found ${users.length}`);
  return users[0].localId;
}

async function idToken(account: TestAccount): Promise<string> {
  const res = await fetch(`${EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`emulator sign-in failed: ${res.status}`);
  return ((await res.json()) as { idToken: string }).idToken;
}

/* ---- API ---------------------------------------------------------------- */

export interface Category { id: string; name: string; color: string; is_saving: boolean; is_protected: boolean; sort_order: number }
export interface IncomeSource { id: string; name: string; is_protected: boolean }
export interface Merchant { id: string; name: string }
export interface Expense {
  id: string;
  date: string;
  amount_cents: number;
  category_id: string;
  merchant: Merchant;
  note: string | null;
  refunded_expense_id: string | null;
  refunded_total_cents: number;
}
export interface IncomeEntry { id: string; date: string; income_source_id: string; gross_cents: number; gross_taxable_cents: number; net_cents: number; note: string | null }

const items = <T>(body: unknown): T[] => (Array.isArray(body) ? body : (body as { items: T[] }).items);

/** The API as one signed-in user, for arranging data and checking what was saved. */
export class Api {
  private constructor(private readonly ctx: APIRequestContext) {}

  static async as(account: TestAccount): Promise<Api> {
    const token = await idToken(account);
    const ctx = await request.newContext({
      baseURL: BASE_URL,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: { authorization: `Bearer ${token}` },
    });
    return new Api(ctx);
  }

  /** One request, with no retry on 429 (for checking the rate limits themselves). */
  async once(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, data?: unknown) {
    return this.ctx.fetch(path, { method, data });
  }

  /** Like any well-behaved client, waits for Retry-After and tries again on 429 (#106). */
  async raw(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, data?: unknown) {
    for (let attempt = 0; ; attempt++) {
      const res = await this.ctx.fetch(path, { method, data });
      if (res.status() !== 429 || attempt >= 10) return res;
      const wait = Number(res.headers()["retry-after"]) || 1;
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }

  private async json<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, data?: unknown): Promise<T> {
    const res = await this.raw(method, path, data);
    if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${await res.text()}`);
    return res.status() === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  async categories() { return items<Category>(await this.json("GET", "/v1/categories")); }
  async category(name: string) {
    const c = (await this.categories()).find((x) => x.name === name);
    if (!c) throw new Error(`no category ${name}`);
    return c;
  }
  async sources() { return items<IncomeSource>(await this.json("GET", "/v1/income-sources")); }
  async createSource(name: string) { return this.json<IncomeSource>("POST", "/v1/income-sources", { name }); }
  async merchants() { return items<Merchant>(await this.json("GET", "/v1/merchants?limit=200")); }
  async expenses(month: string) { return items<Expense>(await this.json("GET", `/v1/expenses?month=${month}&limit=200`)); }
  async expense(id: string) { return this.json<Expense>("GET", `/v1/expenses/${id}`); }
  async income(month: string) { return items<IncomeEntry>(await this.json("GET", `/v1/income-entries?month=${month}&limit=200`)); }

  async createExpense(e: { date: string; amount_cents: number; category: string; merchant: string; note?: string; refunded_expense_id?: string }) {
    const category = await this.category(e.category);
    return this.json<Expense>("POST", "/v1/expenses", {
      date: e.date,
      amount_cents: e.amount_cents,
      category_id: category.id,
      merchant_name: e.merchant,
      note: e.note ?? null,
      ...(e.refunded_expense_id ? { refunded_expense_id: e.refunded_expense_id } : {}),
    });
  }

  async createIncome(e: { date: string; source: IncomeSource; gross: number; taxable: number; net: number; note?: string }) {
    return this.json<IncomeEntry>("POST", "/v1/income-entries", {
      date: e.date,
      income_source_id: e.source.id,
      gross_cents: e.gross,
      gross_taxable_cents: e.taxable,
      net_cents: e.net,
      note: e.note ?? null,
    });
  }

  async dispose() { await this.ctx.dispose(); }
}

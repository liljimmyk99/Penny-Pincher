/**
 * The pieces of the e2e stack (compose.yml) that tests drive directly: the
 * API's `user add` CLI (how accounts are made, with test-generated passwords),
 * an API client for arranging and checking data, and a database tool for the
 * one thing no route can do (ageing a session past its 30 days).
 */
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { request, type APIRequestContext } from "@playwright/test";

export const BASE_URL = "https://localhost:18443";
const E2E_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

/** `docker compose ...` for this stack (project pp-e2e). */
export function compose(...args: string[]): string {
  return composeWithInput(undefined, ...args);
}

/** Like `compose`, with `input` on the command's stdin. */
export function composeWithInput(input: string | undefined, ...args: string[]): string {
  return execFileSync("docker", ["compose", ...args], {
    cwd: E2E_DIR,
    encoding: "utf8",
    input,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
}

export interface TestAccount {
  username: string;
  password: string;
  email?: string;
  name?: string;
}

/** A fresh username, unique per call: `label-xxxxxxxx`. */
export function newUsername(label = "user"): string {
  return `${label}-${randomUUID().slice(0, 8)}`;
}

/** A generated test password (never a real one), well over the 12-character minimum. */
export function newPassword(): string {
  return `pw-${randomBytes(12).toString("base64url")}`;
}

export interface AccountOptions {
  role?: "admin" | "member";
  /** `--must-change`: they choose their own password at first sign-in. */
  mustChange?: boolean;
  email?: string;
  name?: string;
}

/**
 * Adds a user with the real admin CLI, `api user add`, the way the first admin
 * is made. The password goes in on stdin, as the CLI reads it when not on a terminal.
 * Throws with the CLI's message (for example "is already taken") on failure.
 */
export function addUser(account: Pick<TestAccount, "username" | "password">, opts: AccountOptions = {}): void {
  const args = ["exec", "-T", "api", "/api", "user", "add", "--username", account.username, "--role", opts.role ?? "member"];
  if (opts.email) args.push("--email", opts.email);
  if (opts.name) args.push("--name", opts.name);
  if (opts.mustChange) args.push("--must-change");
  try {
    composeWithInput(`${account.password}\n`, ...args);
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? "";
    throw new Error(`api user add ${account.username} failed: ${stderr.trim() || String(err)}`);
  }
}

/** A new user with a generated username and test password, added with the CLI. */
export function createAccount(label = "user", opts: AccountOptions = {}): TestAccount {
  const account: TestAccount = { username: newUsername(label), password: newPassword(), email: opts.email, name: opts.name };
  addUser(account, opts);
  return account;
}

export interface LoginResult {
  token: string;
  must_change_password: boolean;
}

/** `POST /v1/auth/login`, as is: the response, for checking refusals. */
export async function login(username: string, password: string) {
  const ctx = await request.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true });
  try {
    const res = await ctx.post("/v1/auth/login", { data: { username, password } });
    return { status: res.status(), headers: res.headers(), body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
  } finally {
    await ctx.dispose();
  }
}

async function token(account: Pick<TestAccount, "username" | "password">): Promise<string> {
  const res = await login(account.username, account.password);
  if (res.status !== 200) throw new Error(`sign-in as ${account.username} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return (res.body as unknown as LoginResult).token;
}

/**
 * Moves a session's start back by `days` in the database, through the
 * compose `dbtool` service (Node's built-in SQLite on the API's volume, while
 * the API keeps running; WAL allows the second writer). Sessions are found by
 * the SHA-256 of their token, as the API stores them.
 */
export function ageSession(sessionToken: string, days: number): void {
  const out = compose(
    "run", "--rm", "-T", "-e", `TOKEN=${sessionToken}`, "-e", `DAYS=${days}`, "dbtool", "node", "-e",
    `const { DatabaseSync } = require("node:sqlite");
     const { createHash } = require("node:crypto");
     const db = new DatabaseSync("/data/spend.db");
     db.exec("PRAGMA busy_timeout = 5000");
     const hash = createHash("sha256").update(process.env.TOKEN).digest();
     const r = db.prepare("UPDATE sessions SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?) WHERE token_hash = ?")
       .run("-" + process.env.DAYS + " days", hash);
     console.log(r.changes);`,
  );
  if (out.trim().split("\n").pop() !== "1") throw new Error(`expected to age one session, got: ${out}`);
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
  confirmed?: boolean;
  import_id?: string | null;
}
export interface IncomeEntry { id: string; date: string; income_source_id: string; gross_cents: number; gross_taxable_cents: number; net_cents: number; note: string | null }

export interface ImportRecord { id: string; file_name: string; status: string }

const items = <T>(body: unknown): T[] => (Array.isArray(body) ? body : (body as { items: T[] }).items);

/** The API as one signed-in user, for arranging data and checking what was saved. */
export class Api {
  private constructor(private readonly ctx: APIRequestContext) {}

  /** Signs in with the account's password (its own session, separate from any browser's). */
  static async as(account: Pick<TestAccount, "username" | "password">): Promise<Api> {
    return Api.withToken(await token(account));
  }

  /** The API as whoever holds this session token. */
  static async withToken(sessionToken: string): Promise<Api> {
    const ctx = await request.newContext({
      baseURL: BASE_URL,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: { authorization: `Bearer ${sessionToken}` },
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
  async imports() { return items<ImportRecord>(await this.json("GET", "/v1/imports")); }
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

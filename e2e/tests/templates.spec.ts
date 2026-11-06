/**
 * M2 acceptance tests (the "Penny-Pincher M2 Acceptance Tests" doc): templates,
 * starting a month from one, confirming, undo, reset and save-as-template.
 * One test per AT, named after it. Each test gets its own user and builds the
 * doc's "Test Month" fixture, so the tests don't depend on each other's months.
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, signIn, test } from "../support/fixtures";
import { zoneOffUtcDate } from "../support/dates";
import { allowlist, Api, createAccount, type Expense, type IncomeEntry } from "../support/stack";

/* ---- The fixture ------------------------------------------------------- */

const EXPENSE_ITEMS = [
  { name: "Rent", category: "Housing", cents: 120000, day: 1 },
  { name: "Electric", category: "Utilities", cents: 8550, day: 15 },
  { name: "Phone", category: "Utilities", cents: 4500, day: 29 },
  { name: "Gym", category: "Entertainment", cents: 3000, day: 30 },
  { name: "Card payment", category: "Debt", cents: 25000, day: 31 },
  { name: "Savings transfer", category: "Saving", cents: 50000, day: 31 },
] as const;
const INCOME_ITEMS = [
  { label: "Paycheck 1", gross: 250000, taxable: 230000, net: 180000, day: 15 },
  { label: "Paycheck 2", gross: 250000, taxable: 230000, net: 180000, day: 31 },
] as const;
const EXPENSE_TOTAL = 211050;
const NET_TOTAL = 360000;

/** The doc's "Expected dates when applied" table: day 29 / 30 / 31 in each month. */
const CLAMPED: Record<string, [string, string, string]> = {
  "2027-03": ["2027-03-29", "2027-03-30", "2027-03-31"],
  "2027-04": ["2027-04-29", "2027-04-30", "2027-04-30"],
  "2027-02": ["2027-02-28", "2027-02-28", "2027-02-28"],
  "2028-02": ["2028-02-29", "2028-02-29", "2028-02-29"],
};
function expectedDate(month: string, day: number): string {
  if (day <= 28) return `${month}-${String(day).padStart(2, "0")}`;
  return CLAMPED[month][day - 29];
}

interface ApiTemplate { id: string; name: string; expense_items: { merchant: { name: string }; day_of_month: number; amount_cents: number; income_source_id?: string }[]; income_items: { income_source_id: string; day_of_month: number; net_cents: number; note: string | null }[] }
type Entry = (Expense | IncomeEntry) & { confirmed: boolean; template_apply_id: string | null };

/** Template and month calls the shared Api class doesn't have. */
const tpl = {
  async json<T>(api: Api, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, data?: unknown): Promise<T> {
    const res = await api.raw(method, path, data);
    if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${await res.text()}`);
    return res.status() === 204 ? (undefined as T) : ((await res.json()) as T);
  },
  list: async (api: Api) => (await tpl.json<{ items: { id: string; name: string }[] }>(api, "GET", "/v1/templates")).items,
  get: (api: Api, id: string) => tpl.json<ApiTemplate>(api, "GET", `/v1/templates/${id}`),
  apply: (api: Api, month: string, templateId: string, reset = false) =>
    tpl.json<{ id: string }>(api, "POST", `/v1/months/${month}/apply-template`, { template_id: templateId, reset_month: reset }),
  confirmAll: (api: Api, month: string) => tpl.json(api, "POST", `/v1/months/${month}/confirm-all`),
};

/** Builds "Test Month" through the API (with a "Job A" source) and returns its id. */
async function buildTestMonth(api: Api, name = "Test Month") {
  const source = await api.createSource("Job A");
  const t = await tpl.json<{ id: string }>(api, "POST", "/v1/templates", { name });
  for (const item of EXPENSE_ITEMS) {
    const category = await api.category(item.category);
    await tpl.json(api, "POST", `/v1/templates/${t.id}/expense-items`, {
      category_id: category.id,
      merchant_name: item.name,
      day_of_month: item.day,
      amount_cents: item.cents,
    });
  }
  for (const item of INCOME_ITEMS) {
    await tpl.json(api, "POST", `/v1/templates/${t.id}/income-items`, {
      income_source_id: source.id,
      day_of_month: item.day,
      gross_cents: item.gross,
      gross_taxable_cents: item.taxable,
      net_cents: item.net,
      note: item.label,
    });
  }
  return { templateId: t.id, source };
}

async function monthEntries(api: Api, month: string) {
  const expenses = (await api.expenses(month)) as Entry[] as (Expense & Entry)[];
  const income = (await api.income(month)) as Entry[] as (IncomeEntry & Entry)[];
  return { expenses, income, all: [...expenses, ...income] as Entry[] };
}

/** Every copy in the month is on the date the fixture table says. */
async function expectFixtureDates(api: Api, month: string) {
  const { expenses, income } = await monthEntries(api, month);
  expect(new Map(expenses.map((e) => [e.merchant.name, e.date]))).toEqual(
    new Map(EXPENSE_ITEMS.map((i) => [i.name, expectedDate(month, i.day)])),
  );
  expect(new Map(income.map((e) => [e.note, e.date]))).toEqual(
    new Map(INCOME_ITEMS.map((i) => [i.label, expectedDate(month, i.day)])),
  );
}

/* ---- UI helpers -------------------------------------------------------- */

const openMonth = async (page: Page, month: string) => {
  await page.goto(`/transactions?month=${month}`);
  await expect(page.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();
};
const offer = (page: Page, monthName: string) => page.getByRole("region", { name: `Start ${monthName} from your template?` });
const banner = (page: Page) => page.getByRole("region", { name: "Unconfirmed items" });
const expenseRows = (page: Page) => page.locator("table.tx-table--expenses tbody tr");
const expenseRow = (page: Page, merchant: string) =>
  expenseRows(page).filter({ has: page.getByRole("button", { name: new RegExp(`^Edit expense ${merchant},`) }) });
const footer = (page: Page) => page.locator(".tx__footer");

/** Picks "Test Month" when the new-month offer shows a template picker. */
async function pickInOffer(page: Page, monthName: string, template = "Test Month") {
  const select = offer(page, monthName).getByLabel("Template");
  if (await select.count()) await select.selectOption({ label: template });
}

async function copyFromOffer(page: Page, month: string, monthName: string) {
  await openMonth(page, month);
  await pickInOffer(page, monthName);
  await offer(page, monthName).getByRole("button", { name: `Copy into ${monthName}` }).click();
  await expect(banner(page)).toBeVisible();
}

/** "Apply template…" from the header; returns once the copy dialog has its template chosen. */
async function openApplyDialog(page: Page, monthName: string, template = "Test Month") {
  await page.getByRole("button", { name: "Apply template…" }).click();
  const dialog = page.getByRole("dialog", { name: `Apply a template to ${monthName}` });
  await dialog.getByRole("radio", { name: new RegExp(`^${template}`) }).click();
  return dialog;
}

/* ---- A. Templates screen (#27, #29) ------------------------------------- */

async function addExpenseItem(page: Page, item: (typeof EXPENSE_ITEMS)[number]) {
  const group = page.getByRole("group", { name: item.category, exact: true });
  await group.getByRole("button", { name: `Add item to ${item.category}` }).click();
  const draft = group.getByRole("group", { name: "New expense item" });
  const name = draft.getByRole("combobox", { name: "Name, new item" });
  await name.fill(item.name);
  await name.press("Escape");
  await draft.getByLabel("Day of month, new item").fill(String(item.day));
  await draft.getByLabel("Amount, new item").fill((item.cents / 100).toFixed(2));
  await draft.getByLabel("Amount, new item").press("Enter");
  await expect(group.getByRole("group", { name: item.name, exact: true })).toBeVisible();
  await draft.getByRole("button", { name: "Discard new item" }).click();
}

async function addIncomeItem(page: Page, item: (typeof INCOME_ITEMS)[number]) {
  await page.getByRole("button", { name: "Add income" }).click();
  const draft = page.getByRole("group", { name: "New income item" });
  await draft.getByLabel("Source, new income").selectOption({ label: "Job A" });
  await draft.getByLabel("Label, new income").fill(item.label);
  await draft.getByLabel("Day of month, new income").fill(String(item.day));
  await draft.getByLabel("Gross, new income").fill((item.gross / 100).toFixed(2));
  await draft.getByLabel("Gross taxable, new income").fill((item.taxable / 100).toFixed(2));
  await draft.getByLabel("Net, new income").fill((item.net / 100).toFixed(2));
  await draft.getByLabel("Net, new income").press("Enter");
  await expect(page.getByRole("group", { name: `Job A · ${item.label}`, exact: true })).toBeVisible();
  await draft.getByRole("button", { name: "Discard new income" }).click();
}

test("AT-1 create Test Month with every fixture item; the totals match", async ({ signedIn: page, api }) => {
  await api.createSource("Job A");
  await page.goto("/templates");
  await page.getByRole("button", { name: "New template" }).click();
  await page.getByLabel("New template name").fill("Test Month");
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Test Month" })).toBeVisible();

  for (const item of INCOME_ITEMS) await addIncomeItem(page, item);
  for (const item of EXPENSE_ITEMS) await addExpenseItem(page, item);

  const tiles = page.getByRole("group", { name: "Template totals" });
  await expect(tiles).toContainText("Net income$3,600.00");
  await expect(tiles).toContainText("Planned spending$2,110.50");
  await expect(page.locator(".tpl-group__totals")).toContainText("gross $5,000.00 · taxable $4,600.00 · net $3,600.00");

  const [t] = (await tpl.list(api)).filter((x) => x.name === "Test Month");
  const saved = await tpl.get(api, t.id);
  expect(saved.expense_items.reduce((s, i) => s + i.amount_cents, 0)).toBe(EXPENSE_TOTAL);
  expect(saved.income_items.reduce((s, i) => s + i.net_cents, 0)).toBe(NET_TOTAL);
});

test("AT-2 a day of 0 or 32 is rejected on the day field; 1 and 31 save", async ({ signedIn: page, api }) => {
  const { templateId } = await buildTestMonth(api);
  await page.goto(`/templates?template=${templateId}`);
  const row = page.getByRole("group", { name: "Rent", exact: true });
  const day = row.getByLabel("Day of month, Rent");

  for (const bad of ["0", "32"]) {
    await day.fill(bad);
    await day.press("Enter");
    await expect(day).toHaveAttribute("aria-invalid", "true");
    await expect(row.getByRole("alert")).toContainText("Enter a day from 1 to 31.");
  }
  for (const good of [31, 1]) {
    await day.fill(String(good));
    await day.press("Enter");
    await expect(day).not.toHaveAttribute("aria-invalid", "true");
    await expect.poll(async () => (await tpl.get(api, templateId)).expense_items.find((i) => i.merchant.name === "Rent")?.day_of_month).toBe(good);
  }
  // The API refuses them too, not only the form.
  const category = await api.category("Food");
  for (const bad of [0, 32]) {
    const res = await api.raw("POST", `/v1/templates/${templateId}/expense-items`, {
      category_id: category.id, merchant_name: "Bad Day", day_of_month: bad, amount_cents: 100,
    });
    expect(res.status()).toBe(400);
  }
});

test("AT-3 Electric typed as 85.5 saves and reloads as $85.50", async ({ signedIn: page, api }) => {
  const { templateId } = await buildTestMonth(api);
  await page.goto(`/templates?template=${templateId}`);
  const amount = page.getByLabel("Amount, Electric");
  await amount.fill("90");
  await amount.press("Enter");
  await expect.poll(async () => (await tpl.get(api, templateId)).expense_items.find((i) => i.merchant.name === "Electric")?.amount_cents).toBe(9000);
  await amount.fill("85.5");
  await amount.press("Enter");
  await expect.poll(async () => (await tpl.get(api, templateId)).expense_items.find((i) => i.merchant.name === "Electric")?.amount_cents).toBe(8550);
  await page.reload();
  await expect(page.getByLabel("Amount, Electric")).toHaveValue("85.50");
});

test("AT-4 typing \"rent\" offers the existing Rent; no duplicate merchant", async ({ signedIn: page, api }) => {
  const { templateId } = await buildTestMonth(api);
  await page.goto(`/templates?template=${templateId}`);
  const group = page.getByRole("group", { name: "Food", exact: true });
  await group.getByRole("button", { name: "Add item to Food" }).click();
  const draft = group.getByRole("group", { name: "New expense item" });
  await draft.getByRole("combobox", { name: "Name, new item" }).fill("rent");
  await page.getByRole("option", { name: "Rent", exact: true }).click();
  await expect(draft.getByRole("combobox", { name: "Name, new item" })).toHaveValue("Rent");
  await draft.getByLabel("Amount, new item").fill("10");
  await draft.getByLabel("Amount, new item").press("Enter");
  await expect(group.getByRole("group", { name: "Rent", exact: true })).toBeVisible();
  expect((await api.merchants()).filter((m) => m.name.toLowerCase() === "rent")).toHaveLength(1);
});

test("AT-5 renaming one template and deleting another persist", async ({ signedIn: page, api }) => {
  const { templateId } = await buildTestMonth(api);
  const spare = await tpl.json<{ id: string }>(api, "POST", "/v1/templates", { name: "Spare" });
  await page.goto(`/templates?template=${templateId}`);
  await page.getByRole("button", { name: "Rename" }).click();
  const rename = page.getByRole("dialog", { name: "Rename template" });
  await rename.getByLabel("Template name").fill("Test Month Renamed");
  await rename.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Test Month Renamed" })).toBeVisible();

  await page.goto(`/templates?template=${spare.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Spare" })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete template" }).click();
  await expect(page.getByRole("button", { name: /^Spare/ })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: /^Test Month Renamed/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Spare/ })).toHaveCount(0);
  const names = (await tpl.list(api)).map((t) => t.name);
  expect(names).toContain("Test Month Renamed");
  expect(names).not.toContain("Spare");
});

/* ---- B. Starting a month (#28, #30) ------------------------------------ */

test("AT-7 an empty month offers to start from the template, with preview and actions", async ({ signedIn: page, api }) => {
  await buildTestMonth(api);
  await openMonth(page, "2027-03");
  await pickInOffer(page, "March");
  const card = offer(page, "March");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Rent");
  await expect(card).toContainText("$1,200.00");
  await expect(card).toContainText("Paycheck 1");
  await expect(card.getByRole("button", { name: "Copy into March" })).toBeEnabled();
  await expect(card.getByRole("button", { name: "Start blank" })).toBeVisible();
  await expect(card.getByRole("link", { name: "Edit template" })).toBeVisible();
});

test("AT-8 Copy creates 8 entries on the fixture dates; totals equal the template's", async ({ signedIn: page, api }) => {
  await buildTestMonth(api);
  await copyFromOffer(page, "2027-03", "March");
  const { expenses, income } = await monthEntries(api, "2027-03");
  expect(expenses).toHaveLength(6);
  expect(income).toHaveLength(2);
  await expectFixtureDates(api, "2027-03");
  expect(expenses.reduce((s, e) => s + e.amount_cents, 0)).toBe(EXPENSE_TOTAL);
  expect(income.reduce((s, e) => s + e.net_cents, 0)).toBe(NET_TOTAL);
  await expect(footer(page)).toHaveText("6 expenses · $2,110.50");
});

test("AT-9 copied rows are tinted and pilled; the banner offers Confirm all and Undo", async ({ signedIn: page, api }) => {
  await buildTestMonth(api);
  await copyFromOffer(page, "2027-03", "March");
  const unconfirmed = page.locator("tr.is-unconfirmed");
  await expect(unconfirmed).toHaveCount(8);
  await expect(page.locator(".pill-unconfirmed").filter({ hasText: "Unconfirmed · from template" })).toHaveCount(8);
  // The tint is on the row's cells. Confirm one row to get a plain row to compare with.
  const cellBg = (row: ReturnType<typeof expenseRow>) => row.locator("td").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  const tinted = await cellBg(expenseRow(page, "Gym"));
  await expenseRow(page, "Rent").getByRole("button", { name: /^Confirm expense Rent/ }).click();
  await expect(expenseRow(page, "Rent")).not.toHaveClass(/is-unconfirmed/);
  expect(tinted).not.toBe(await cellBg(expenseRow(page, "Rent")));
  await expect(unconfirmed).toHaveCount(7);
  await expect(banner(page)).toContainText("7 items copied from “Test Month”");
  await expect(banner(page).getByRole("button", { name: "Confirm all as-is" })).toBeVisible();
  await expect(banner(page).getByRole("button", { name: /^Undo copying/ })).toBeVisible();
  // "Review in Transactions" is for the Summary banner (M3); on Transactions the page is the review.
  await expect(banner(page).getByRole("link", { name: "Review in Transactions" })).toHaveCount(0);
});

test("AT-10 April 2027, February 2027 and February 2028 dates match the table", async ({ signedIn: page, api }) => {
  await buildTestMonth(api);
  for (const [month, name] of [["2027-04", "April"], ["2027-02", "February"], ["2028-02", "February"]] as const) {
    await copyFromOffer(page, month, name);
    await expectFixtureDates(api, month);
  }
});

test("AT-11 Start blank leaves the month empty; Edit template opens the editor", async ({ signedIn: page, api }) => {
  const { templateId } = await buildTestMonth(api);
  await openMonth(page, "2027-09");
  await offer(page, "September").getByRole("button", { name: "Start blank" }).click();
  await expect(offer(page, "September")).toHaveCount(0);
  expect((await monthEntries(api, "2027-09")).all).toHaveLength(0);

  await page.reload();
  await pickInOffer(page, "September");
  await offer(page, "September").getByRole("link", { name: "Edit template" }).click();
  await expect(page).toHaveURL(new RegExp(`/templates\\?template=${templateId}`));
  await expect(page.getByRole("heading", { level: 1, name: "Test Month" })).toBeVisible();
});

test.describe("AT-12 applying in a time zone whose day differs from UTC's", () => {
  // Stands in for "after 7 pm Eastern" at any hour (see e2e/AGENTS.md).
  test.use({ timezoneId: zoneOffUtcDate() });

  test("AT-12 dates still match the table", async ({ signedIn: page, api }) => {
    await buildTestMonth(api);
    await copyFromOffer(page, "2027-04", "April");
    await expectFixtureDates(api, "2027-04");
    await expect(expenseRow(page, "Card payment").locator(".tx-table__date")).toHaveText("Apr 30");
    await expect(expenseRow(page, "Rent").locator(".tx-table__date")).toHaveText("Apr 1");
  });
});

/* ---- C. Confirming and undo -------------------------------------------- */

test("AT-13 editing Electric to $92.10 confirms it; the total rises by $6.60", async ({ signedIn: page, api }) => {
  await buildTestMonth(api);
  await copyFromOffer(page, "2027-04", "April");
  await expect(footer(page)).toHaveText("6 expenses · $2,110.50");
  await expenseRow(page, "Electric").getByRole("button", { name: /^Edit expense Electric/ }).click();
  const dialog = page.getByRole("dialog", { name: "Edit expense" });
  await dialog.getByLabel("Amount").fill("92.10");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();

  const electric = expenseRow(page, "Electric");
  await expect(electric).not.toHaveClass(/is-unconfirmed/);
  await expect(electric.locator(".pill-unconfirmed")).toHaveCount(0);
  await expect(footer(page)).toHaveText("6 expenses · $2,117.10");
  const saved = (await monthEntries(api, "2027-04")).expenses.find((e) => e.merchant.name === "Electric")!;
  expect(saved).toMatchObject({ amount_cents: 9210, confirmed: true });
});

test("AT-14 Undo removes only the 7 unconfirmed copies; Electric and a manual expense stay", async ({ signedIn: page, api }) => {
  await buildTestMonth(api);
  await copyFromOffer(page, "2027-04", "April");
  // Electric edited (so confirmed), as in AT-13; then a manual expense.
  const electric = (await monthEntries(api, "2027-04")).expenses.find((e) => e.merchant.name === "Electric")!;
  await tpl.json(api, "PATCH", `/v1/expenses/${electric.id}`, { amount_cents: 9210 });
  await api.createExpense({ date: "2027-04-12", amount_cents: 1200, category: "Food", merchant: "Corner Cafe" });
  await page.reload();

  await banner(page).getByRole("button", { name: /^Undo copying/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Undone · removed 7 copied items" })).toBeVisible();
  const { expenses, income } = await monthEntries(api, "2027-04");
  expect(expenses.map((e) => e.merchant.name).sort()).toEqual(["Corner Cafe", "Electric"]);
  expect(income).toHaveLength(0);
  await expect(banner(page)).toHaveCount(0);
});

test("AT-15 Confirm all as-is leaves nothing unconfirmed, and Undo then removes nothing", async ({ signedIn: page, api }) => {
  await buildTestMonth(api);
  await copyFromOffer(page, "2027-07", "July");
  // The per-row Confirm button, on one row, first.
  await expenseRow(page, "Rent").getByRole("button", { name: /^Confirm expense Rent/ }).click();
  await expect(expenseRow(page, "Rent")).not.toHaveClass(/is-unconfirmed/);

  await banner(page).getByRole("button", { name: "Confirm all as-is" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Confirmed 7 items in July" })).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
  await expect(page.locator("tr.is-unconfirmed")).toHaveCount(0);
  const { all } = await monthEntries(api, "2027-07");
  expect(all.every((e) => e.confirmed)).toBe(true);

  const [apply] = (await tpl.json<{ items: { id: string }[] }>(api, "GET", "/v1/template-applies?month=2027-07")).items;
  const undo = await tpl.json<{ removed_expense_count: number; removed_income_entry_count: number }>(api, "POST", `/v1/template-applies/${apply.id}/undo`);
  expect(undo).toMatchObject({ removed_expense_count: 0, removed_income_entry_count: 0 });
  expect((await monthEntries(api, "2027-07")).all).toHaveLength(8);
});

/* ---- D. Applying to a month with data (reset) -------------------------- */

/** April 2027 with copies (Electric edited and confirmed) and a manual expense; March 2027 applied and confirmed. */
async function aprilWithData(api: Api, templateId: string) {
  await tpl.apply(api, "2027-03", templateId);
  await tpl.confirmAll(api, "2027-03");
  await tpl.apply(api, "2027-04", templateId);
  const electric = (await monthEntries(api, "2027-04")).expenses.find((e) => e.merchant.name === "Electric")!;
  await tpl.json(api, "PATCH", `/v1/expenses/${electric.id}`, { amount_cents: 9210 });
  await api.createExpense({ date: "2027-04-12", amount_cents: 1200, category: "Food", merchant: "Corner Cafe" });
}

test("AT-16 applying to a month with data asks for a full reset; Cancel changes nothing", async ({ signedIn: page, api }) => {
  const { templateId } = await buildTestMonth(api);
  await aprilWithData(api, templateId);
  const before = (await monthEntries(api, "2027-04")).all.map((e) => e.id).sort();

  await openMonth(page, "2027-04");
  await (await openApplyDialog(page, "April")).getByRole("button", { name: "Copy into April" }).click();
  const reset = page.getByRole("alertdialog", { name: "Replace everything in April?" });
  await expect(reset).toContainText("April 2027 already has 7 expenses and 2 income entries.");
  await expect(reset).toContainText("confirmed or not");
  await expect(reset).toContainText("can’t bring back what was deleted");
  await reset.getByRole("button", { name: "Cancel" }).click();
  await expect(reset).toBeHidden();
  expect((await monthEntries(api, "2027-04")).all.map((e) => e.id).sort()).toEqual(before);
});

test("AT-17 confirming the reset replaces all of April with 8 fresh copies; March is untouched", async ({ signedIn: page, api }) => {
  const { templateId } = await buildTestMonth(api);
  await aprilWithData(api, templateId);
  const march = (await monthEntries(api, "2027-03")).all.map((e) => `${e.id}:${e.confirmed}`).sort();

  await openMonth(page, "2027-04");
  await (await openApplyDialog(page, "April")).getByRole("button", { name: "Copy into April" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete all and copy template" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied 8 items into April" })).toBeVisible();

  const { expenses, all } = await monthEntries(api, "2027-04");
  expect(all).toHaveLength(8);
  expect(all.every((e) => !e.confirmed)).toBe(true);
  expect(expenses.map((e) => e.merchant.name)).not.toContain("Corner Cafe");
  expect(expenses.find((e) => e.merchant.name === "Electric")!.amount_cents).toBe(8550);
  expect((await monthEntries(api, "2027-03")).all.map((e) => `${e.id}:${e.confirmed}`).sort()).toEqual(march);
});

test("AT-18 + AT-19 a reset unlinks (keeps) a refund elsewhere; Undo right after leaves May empty", async ({ signedIn: page, api }) => {
  await buildTestMonth(api);
  const original = await api.createExpense({ date: "2027-05-10", amount_cents: 10000, category: "Food", merchant: "Test Shop" });
  const refund = await api.createExpense({
    date: "2027-06-03", amount_cents: -4000, category: "Food", merchant: "Test Shop", refunded_expense_id: original.id,
  });

  // AT-18
  await openMonth(page, "2027-05");
  await (await openApplyDialog(page, "May")).getByRole("button", { name: "Copy into May" }).click();
  await page.getByRole("alertdialog", { name: "Replace everything in May?" }).getByRole("button", { name: "Delete all and copy template" }).click();
  await expect(banner(page)).toBeVisible();
  expect((await monthEntries(api, "2027-05")).expenses.map((e) => e.merchant.name)).not.toContain("Test Shop");
  const kept = await api.expense(refund.id);
  expect(kept).toMatchObject({ amount_cents: -4000, refunded_expense_id: null, date: "2027-06-03" });

  // AT-19
  await banner(page).getByRole("button", { name: /^Undo copying/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Undone · removed 8 copied items" })).toBeVisible();
  expect((await monthEntries(api, "2027-05")).all).toHaveLength(0);
  expect((await api.raw("GET", `/v1/expenses/${original.id}`)).status()).toBe(404);

  // The refund still counts in June, unlinked.
  await openMonth(page, "2027-06");
  const row = expenseRows(page).filter({ has: page.getByRole("button", { name: /^Edit refund Test Shop/ }) });
  await expect(row.locator(".pill")).toHaveText("Not linked");
  await expect(page.getByRole("region", { name: "Refunds this month" })).toContainText("−$40.00");
});

/* ---- E. Save month as template ----------------------------------------- */

test("AT-20 + AT-21 save a month as a template (refund left out); its day-31 item lands on April 30", async ({ signedIn: page, api }) => {
  const { source, templateId } = await buildTestMonth(api);
  await api.createExpense({ date: "2027-08-31", amount_cents: 7500, category: "Food", merchant: "Month End Market" });
  await api.createExpense({ date: "2027-08-05", amount_cents: 2000, category: "Entertainment", merchant: "Cinema" });
  await api.createExpense({ date: "2027-08-31", amount_cents: -1500, category: "Food", merchant: "Month End Market" });
  await api.createIncome({ date: "2027-08-20", source, gross: 100000, taxable: 90000, net: 80000, note: "Bonus" });

  // AT-20
  await openMonth(page, "2027-08");
  await page.getByRole("button", { name: "Save as template…" }).click();
  const dialog = page.getByRole("dialog", { name: "Save August as a template" });
  await expect(dialog.getByLabel("Template name")).toHaveValue("August 2027");
  await dialog.getByRole("button", { name: "Save template" }).click();
  await expect(dialog).toBeHidden();

  const saved = (await tpl.list(api)).find((t) => t.name === "August 2027")!;
  const t = await tpl.get(api, saved.id);
  expect(t.expense_items.map((i) => [i.merchant.name, i.day_of_month, i.amount_cents]).sort()).toEqual(
    [["Cinema", 5, 2000], ["Month End Market", 31, 7500]],
  );
  expect(t.income_items.map((i) => [i.note, i.day_of_month, i.net_cents])).toEqual([["Bonus", 20, 80000]]);
  expect(t.expense_items.every((i) => i.amount_cents > 0)).toBe(true);
  expect((await monthEntries(api, "2027-08")).all).toHaveLength(4); // the month itself is unchanged

  // AT-21: April 2027 has data, so this is a reset.
  await tpl.apply(api, "2027-04", templateId);
  await openMonth(page, "2027-04");
  await (await openApplyDialog(page, "April", "August 2027")).getByRole("button", { name: "Copy into April" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete all and copy template" }).click();
  await expect(banner(page)).toBeVisible();
  const april = await monthEntries(api, "2027-04");
  expect(april.expenses.find((e) => e.merchant.name === "Month End Market")?.date).toBe("2027-04-30");
  expect(april.all).toHaveLength(3);
});

/* ---- F. Across the app ------------------------------------------------- */

test("AT-22 a second user sees none of your templates, and applying there never touches yours", async ({ browser, api }) => {
  const { templateId } = await buildTestMonth(api);
  await tpl.apply(api, "2027-03", templateId);
  const mine = (await monthEntries(api, "2027-03")).all.map((e) => e.id).sort();

  const other = await createAccount("second");
  allowlist(other);
  const otherApi = await Api.as(other);
  try {
    expect((await tpl.list(otherApi)).map((t) => t.name)).not.toContain("Test Month");
    expect((await otherApi.raw("GET", `/v1/templates/${templateId}`)).status()).toBe(404);
    expect((await otherApi.raw("POST", "/v1/months/2027-03/apply-template", { template_id: templateId })).status()).toBe(404);

    const { templateId: theirs } = await buildTestMonth(otherApi, "Their Month");
    await tpl.apply(otherApi, "2027-03", theirs, true);
    expect((await monthEntries(otherApi, "2027-03")).all).toHaveLength(8);
    expect((await monthEntries(api, "2027-03")).all.map((e) => e.id).sort()).toEqual(mine);
    expect((await tpl.list(api)).map((t) => t.name)).not.toContain("Their Month");

    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, other, "/templates");
    await expect(page.getByRole("heading", { name: "Your templates" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Their Month/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Test Month/ })).toHaveCount(0);
    await context.close();
  } finally {
    await otherApi.dispose();
  }
});

test("AT-23 deleting a source with template items but no entries moves its items to Other", async ({ signedIn: page, api }) => {
  const { templateId } = await buildTestMonth(api);
  const gig = await api.createSource("Side Gig");
  await tpl.json(api, "POST", `/v1/templates/${templateId}/income-items`, {
    income_source_id: gig.id, day_of_month: 10, gross_cents: 30000, gross_taxable_cents: 30000, net_cents: 27000, note: "Gig pay",
  });

  await page.goto("/categories");
  const sources = page.getByRole("table", { name: "Income sources" });
  await sources.getByRole("button", { name: "Delete Side Gig" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: /^Delete/ }).click();
  await expect(sources.locator("tbody tr").filter({ hasText: "Side Gig" })).toHaveCount(0);

  const other = (await api.sources()).find((s) => s.name === "Other")!;
  const item = (await tpl.get(api, templateId)).income_items.find((i) => i.note === "Gig pay");
  expect(item?.income_source_id).toBe(other.id);
  await page.goto(`/templates?template=${templateId}`);
  await expect(page.getByRole("group", { name: "Other · Gig pay", exact: true })).toBeVisible();
});

test.describe("AT-24 dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("AT-24 the templates screen, unconfirmed rows and banner are readable in dark mode", async ({ signedIn: page, api }, testInfo) => {
    const { templateId } = await buildTestMonth(api);
    const contrast = async (...include: string[]) => {
      let axe = new AxeBuilder({ page }).withRules(["color-contrast"]);
      for (const sel of include) axe = axe.include(sel);
      return (await axe.analyze()).violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")}: ${n.failureSummary}`));
    };

    await page.goto(`/templates?template=${templateId}`);
    await expect(page.getByRole("group", { name: "Template totals" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await testInfo.attach("dark templates", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    expect(await contrast(), "colour-contrast on Templates").toEqual([]);

    await copyFromOffer(page, "2027-03", "March");
    await expect(page.locator("tr.is-unconfirmed")).toHaveCount(8);
    await testInfo.attach("dark unconfirmed month", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    expect(await contrast(".month-banner", "tr.is-unconfirmed"), "colour-contrast on the banner and unconfirmed rows").toEqual([]);
  });
});

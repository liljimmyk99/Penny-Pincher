/**
 * Fixture workbooks for the import tests, built in memory with generic data only.
 * They follow the import template's layout: an Expenses sheet (Date, Category,
 * Merchant, Amount, Note) and an Income sheet (Date, Source, Gross, Gross taxable,
 * Net, Note). Dates are YYYY-MM-DD text; amounts are dollars.
 */
import { createRequire } from "node:module";
import type ExcelJSTypes from "exceljs";
import { shiftMonth } from "./dates";

// Loaded with Node's own require: Playwright's module loader chokes on exceljs's dependency tree.
const ExcelJS = createRequire(import.meta.url)("exceljs") as typeof ExcelJSTypes;

export type ExpenseRow = [date: string, category: string, merchant: string, amount: string | number, note?: string];
export type IncomeRow = [date: string, source: string, gross: string | number, taxable: string | number, net: string | number, note?: string];

export const EXPENSE_HEADERS = ["Date", "Category", "Merchant", "Amount", "Note"];
export const INCOME_HEADERS = ["Date", "Source", "Gross", "Gross taxable", "Net", "Note"];
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** A workbook with the two template sheets. Text cells stay text, so odd values reach the server as written. */
export async function workbook(expenses: ExpenseRow[], income: IncomeRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const exp = wb.addWorksheet("Expenses");
  exp.addRow(EXPENSE_HEADERS);
  for (const r of expenses) exp.addRow(r.map((c) => c ?? null));
  const inc = wb.addWorksheet("Income");
  inc.addRow(INCOME_HEADERS);
  for (const r of income) inc.addRow(r.map((c) => c ?? null));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A file in the shape Playwright's setInputFiles takes. */
export const asFile = (name: string, buffer: Buffer) => ({ name, mimeType: XLSX_TYPE, buffer });

/** Sheet names and the first row of each, read back from a downloaded workbook. */
export async function readSheets(buffer: Buffer): Promise<Record<string, string[]>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJSTypes.Buffer);
  const out: Record<string, string[]> = {};
  for (const ws of wb.worksheets) out[ws.name] = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? ""));
  return out;
}

/** Valid rows only, across two years. Source is the name of an existing income source. */
export function cleanMultiYear(source: string) {
  const expenses: ExpenseRow[] = [
    ["2023-11-05", "Food", "Corner Market", "42.50"],
    ["2023-11-20", "Housing", "Landlord Co", "900.00", "Rent"],
    ["2023-12-02", "Utilities", "Power Co", "61.25"],
    ["2024-01-10", "Food", "Corner Market", "38.10"],
    ["2024-01-15", "Food", "Corner Market", "-8.10", "Refund"],
    ["2024-02-03", "Entertainment", "Cinema", "24.00"],
  ];
  const income: IncomeRow[] = [
    ["2023-11-30", source, "3000.00", "2800.00", "2300.00"],
    ["2023-12-31", source, "3000.00", "2800.00", "2300.00"],
    ["2024-01-31", source, "3100.00", "2900.00", "2400.00"],
  ];
  return { expenses, income, expenseCount: expenses.length, incomeCount: income.length };
}

/**
 * One bad row for each problem code, plus a few good ones.
 * The unknown names are deliberately not in the user's lists.
 */
export function oneOfEachIssue(source: string) {
  const good: ExpenseRow[] = [
    ["2024-03-04", "Food", "Corner Market", "12.00"],
    ["2024-03-09", "Housing", "Landlord Co", "800.00"],
    ["2024-04-02", "Utilities", "Power Co", "55.00"],
  ];
  const bad: ExpenseRow[] = [
    ["2024-03-10", "No Such Category", "Corner Market", "5.00"], // unknown_category
    ["not a date", "Food", "Corner Market", "5.00"], // invalid_date
    ["2024-03-11", "Food", "", "5.00"], // missing_value
    ["2024-03-12", "Food", "Corner Market", "abc"], // invalid_number
    ["2024-03-13", "Food", "Corner Market", "5.001"], // too_many_decimals
    ["2024-03-14", "Food", "Corner Market", "0"], // zero_amount
    ["2024-03-15", "Food", "Corner Market", "5.00", "x".repeat(501)], // text_too_long
  ];
  const goodIncome: IncomeRow[] = [["2024-03-31", source, "3000.00", "2800.00", "2300.00"]];
  const badIncome: IncomeRow[] = [
    ["2024-03-31", "No Such Source", "100.00", "100.00", "100.00"], // unknown_income_source
    ["2024-03-31", source, "-100.00", "100.00", "100.00"], // negative_income
    ["2024-03-31", source, "100.00", "200.00", "100.00"], // taxable_exceeds_gross
    ["2024-03-31", source, "100.00", "100.00", "200.00"], // net_exceeds_gross
  ];
  return {
    expenses: [...good, ...bad],
    income: [...goodIncome, ...badIncome],
    ready: good.length + goodIncome.length,
    problems: bad.length + badIncome.length,
    goodExpenses: good,
  };
}

/** A few valid rows in `month` (YYYY-MM), for a month that already has hand-added entries. */
export function overlapping(month: string, source: string) {
  const expenses: ExpenseRow[] = [
    [`${month}-05`, "Food", "Imported Market", "20.00"],
    [`${month}-12`, "Utilities", "Imported Power", "30.00"],
  ];
  const income: IncomeRow[] = [[`${month}-28`, source, "2000.00", "1800.00", "1500.00"]];
  return { expenses, income, expenseCount: expenses.length, incomeCount: income.length };
}

/**
 * `count` valid expense rows spread over many months ending the month before `endMonth`,
 * big enough that the import takes a while (the server writes 200 rows per batch); every row has its own merchant and a long note to slow it further.
 * Returns the months the rows fall in.
 */
export function large(count: number, endMonth: string) {
  const months = 60;
  const expenses: ExpenseRow[] = [];
  const touched = new Set<string>();
  for (let i = 0; i < count; i++) {
    const month = shiftMonth(endMonth, -1 - (i % months));
    touched.add(month);
    expenses.push([`${month}-${String(1 + (i % 28)).padStart(2, "0")}`, "Food", `Bulk Shop ${i}`, (1 + (i % 90)).toFixed(2), `Bulk note ${i} ${"x".repeat(200)}`]);
  }
  return { expenses, income: [] as IncomeRow[], months: [...touched].sort() };
}

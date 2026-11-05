import { fieldErrors, type Schemas } from "../../api";
import { isDate } from "../../lib/dates";
import { parseCents } from "../../lib/money";

/**
 * One row of the expense batch table, as typed. Amounts stay text until save;
 * `rowCents` turns them into integer cents.
 */
export interface ExpenseRow {
  key: number;
  date: string;
  merchant: string;
  /** The existing merchant this name matches, once known (picked or looked up). */
  merchantId: string | null;
  categoryId: string;
  /** The user chose the category, so a merchant's usual one must not overwrite it. */
  categoryTouched: boolean;
  amount: string;
  note: string;
  /** Added with "Add refund". A negative amount also makes a row a refund. */
  refund: boolean;
  refundedExpenseId: string | null;
}

export type RowField = "date" | "merchant" | "category" | "amount" | "note" | "link";
export type RowErrors = Partial<Record<RowField, string>>;

export const NOTE_MAX = 500;
export const MERCHANT_MAX = 100;

let nextKey = 1;

export function emptyRow(date: string, refund = false): ExpenseRow {
  return {
    key: nextKey++,
    date,
    merchant: "",
    merchantId: null,
    categoryId: "",
    categoryTouched: false,
    amount: "",
    note: "",
    refund,
    refundedExpenseId: null,
  };
}

/** Nothing typed yet; blank rows are skipped on save. */
export function isBlank(row: ExpenseRow): boolean {
  return !row.merchant.trim() && !row.amount.trim() && !row.note.trim() && !row.refund;
}

export function isRefund(row: ExpenseRow): boolean {
  return row.refund || (parseCents(row.amount) ?? 0) < 0;
}

/**
 * The signed amount to save: refunds are negative (root AGENTS.md §5), whether
 * the user typed "24.99" in a refund row or "-24.99" in any row.
 */
export function rowCents(row: ExpenseRow): number | null {
  const cents = parseCents(row.amount);
  if (cents === null) return null;
  const abs = Math.abs(cents);
  return isRefund(row) ? -abs : abs;
}

export function validateRow(row: ExpenseRow): RowErrors {
  const errors: RowErrors = {};
  if (!isDate(row.date)) errors.date = "Pick a date.";
  if (!row.merchant.trim()) errors.merchant = "Enter a merchant.";
  else if (row.merchant.trim().length > MERCHANT_MAX) errors.merchant = `Keep it under ${MERCHANT_MAX} characters.`;
  if (!row.categoryId) errors.category = "Choose a category.";
  const cents = rowCents(row);
  if (!row.amount.trim()) errors.amount = "Enter an amount.";
  else if (cents === null) errors.amount = "Enter an amount like 12.34.";
  else if (cents === 0) errors.amount = "The amount can't be zero.";
  if (row.note.trim().length > NOTE_MAX) errors.note = `Keep the note under ${NOTE_MAX} characters.`;
  return errors;
}

export function toCreate(row: ExpenseRow): Schemas["ExpenseCreate"] {
  const cents = rowCents(row);
  if (cents === null) throw new Error("toCreate needs a valid row");
  const body: Schemas["ExpenseCreate"] = {
    date: row.date,
    amount_cents: cents,
    category_id: row.categoryId,
    merchant_name: row.merchant.trim(),
    note: row.note.trim() || null,
    confirmed: true,
  };
  if (cents < 0 && row.refundedExpenseId) body.refunded_expense_id = row.refundedExpenseId;
  return body;
}

const SERVER_FIELDS: Record<string, RowField> = {
  date: "date",
  merchant_name: "merchant",
  category_id: "category",
  amount_cents: "amount",
  note: "note",
  refunded_expense_id: "link",
};

/**
 * Maps a batch error's `details` (`items[3].amount_cents`) back onto the rows
 * that were sent, by position. Issues on other fields come back in `other`.
 */
export function batchErrors(err: unknown, sent: ExpenseRow[]): { byRow: Map<number, RowErrors>; other: string[] } {
  const byRow = new Map<number, RowErrors>();
  const other: string[] = [];
  for (const [field, issue] of Object.entries(fieldErrors(err))) {
    const m = /^items\[(\d+)\]\.(\w+)$/.exec(field);
    const row = m ? sent[Number(m[1])] : undefined;
    const rowField = m ? SERVER_FIELDS[m[2]] : undefined;
    if (!row || !rowField) {
      other.push(issue);
      continue;
    }
    const errors = byRow.get(row.key) ?? {};
    errors[rowField] ??= issue;
    byRow.set(row.key, errors);
  }
  return { byRow, other };
}

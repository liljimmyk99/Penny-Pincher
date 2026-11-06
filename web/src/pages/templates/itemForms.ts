import type { Schemas } from "../../api";
import { MERCHANT_MAX, NOTE_MAX } from "../../lib/limits";
import { centsToInput, parseCents } from "../../lib/money";

/**
 * The editable text of a template row, and turning it back into API bodies.
 * Fields are strings while the user types; money becomes integer cents only
 * through `parseCents`.
 */

export interface ExpenseForm {
  merchant: string;
  categoryId: string;
  day: string;
  amount: string;
  note: string;
}

export type ExpenseField = keyof ExpenseForm;

export interface IncomeForm {
  sourceId: string;
  label: string;
  day: string;
  gross: string;
  taxable: string;
  net: string;
}

export type IncomeField = keyof IncomeForm;

export type Errors<F extends string> = Partial<Record<F, string>>;

/** API field names → form fields, for 400 `details`. */
export const EXPENSE_API_FIELDS: Record<string, ExpenseField> = {
  merchant_name: "merchant",
  category_id: "categoryId",
  day_of_month: "day",
  amount_cents: "amount",
  note: "note",
};

export const INCOME_API_FIELDS: Record<string, IncomeField> = {
  income_source_id: "sourceId",
  note: "label",
  day_of_month: "day",
  gross_cents: "gross",
  gross_taxable_cents: "taxable",
  net_cents: "net",
};

export function expenseForm(item: Schemas["TemplateExpenseItem"]): ExpenseForm {
  return {
    merchant: item.merchant.name,
    categoryId: item.category_id,
    day: String(item.day_of_month),
    amount: centsToInput(item.amount_cents),
    note: item.note ?? "",
  };
}

export function incomeForm(item: Schemas["TemplateIncomeItem"]): IncomeForm {
  return {
    sourceId: item.income_source_id,
    label: item.note ?? "",
    day: String(item.day_of_month),
    gross: centsToInput(item.gross_cents),
    taxable: centsToInput(item.gross_taxable_cents),
    net: centsToInput(item.net_cents),
  };
}

/** 1–31, whole numbers only. */
export function parseDay(input: string): number | null {
  const text = input.trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const day = Number(text);
  return day >= 1 && day <= 31 ? day : null;
}

const DAY_ERROR = "Enter a day from 1 to 31.";

export function validateExpense(form: ExpenseForm):
  | { ok: true; value: Schemas["TemplateExpenseItemCreate"] }
  | { ok: false; errors: Errors<ExpenseField> } {
  const errors: Errors<ExpenseField> = {};
  const merchant = form.merchant.trim();
  if (!merchant) errors.merchant = "Enter a name.";
  else if (merchant.length > MERCHANT_MAX) errors.merchant = `Use ${MERCHANT_MAX} characters or fewer.`;
  if (!form.categoryId) errors.categoryId = "Choose a category.";
  const day = parseDay(form.day);
  if (day === null) errors.day = DAY_ERROR;
  const amount = parseCents(form.amount);
  if (amount === null || amount <= 0) errors.amount = "Enter an amount above $0.00.";
  const note = form.note.trim();
  if (note.length > NOTE_MAX) errors.note = `Use ${NOTE_MAX} characters or fewer.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      merchant_name: merchant,
      category_id: form.categoryId,
      day_of_month: day!,
      amount_cents: amount!,
      note: note || null,
    },
  };
}

export function validateIncome(form: IncomeForm):
  | { ok: true; value: Schemas["TemplateIncomeItemCreate"] }
  | { ok: false; errors: Errors<IncomeField> } {
  const errors: Errors<IncomeField> = {};
  if (!form.sourceId) errors.sourceId = "Choose a source.";
  const label = form.label.trim();
  if (label.length > NOTE_MAX) errors.label = `Use ${NOTE_MAX} characters or fewer.`;
  const day = parseDay(form.day);
  if (day === null) errors.day = DAY_ERROR;
  const money = (text: string) => {
    const cents = parseCents(text);
    return cents === null || cents < 0 ? null : cents;
  };
  const gross = money(form.gross);
  const taxable = money(form.taxable);
  const net = money(form.net);
  if (gross === null) errors.gross = "Enter gross pay, $0.00 or more.";
  if (taxable === null) errors.taxable = "Enter gross taxable, $0.00 or more.";
  else if (gross !== null && taxable > gross) errors.taxable = "Gross taxable can’t be more than gross.";
  if (net === null) errors.net = "Enter net pay, $0.00 or more.";
  else if (gross !== null && net > gross) errors.net = "Net can’t be more than gross.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      income_source_id: form.sourceId,
      note: label || null,
      day_of_month: day!,
      gross_cents: gross!,
      gross_taxable_cents: taxable!,
      net_cents: net!,
    },
  };
}

/** Only the fields that differ from the saved item, so a PATCH sends just the edit. */
export function expensePatch(
  item: Schemas["TemplateExpenseItem"],
  value: Schemas["TemplateExpenseItemCreate"],
): Schemas["TemplateExpenseItemUpdate"] {
  const patch: Schemas["TemplateExpenseItemUpdate"] = {};
  if (value.merchant_name !== item.merchant.name) patch.merchant_name = value.merchant_name;
  if (value.category_id !== item.category_id) patch.category_id = value.category_id;
  if (value.day_of_month !== item.day_of_month) patch.day_of_month = value.day_of_month;
  if (value.amount_cents !== item.amount_cents) patch.amount_cents = value.amount_cents;
  if ((value.note ?? null) !== (item.note ?? null)) patch.note = value.note;
  return patch;
}

export function incomePatch(
  item: Schemas["TemplateIncomeItem"],
  value: Schemas["TemplateIncomeItemCreate"],
): Schemas["TemplateIncomeItemUpdate"] {
  const patch: Schemas["TemplateIncomeItemUpdate"] = {};
  if (value.income_source_id !== item.income_source_id) patch.income_source_id = value.income_source_id;
  if ((value.note ?? null) !== (item.note ?? null)) patch.note = value.note;
  if (value.day_of_month !== item.day_of_month) patch.day_of_month = value.day_of_month;
  if (value.gross_cents !== item.gross_cents) patch.gross_cents = value.gross_cents;
  if (value.gross_taxable_cents !== item.gross_taxable_cents) patch.gross_taxable_cents = value.gross_taxable_cents;
  if (value.net_cents !== item.net_cents) patch.net_cents = value.net_cents;
  return patch;
}

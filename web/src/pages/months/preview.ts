import type { Schemas } from "../../api";
import { templateTotals, type TemplateTotals } from "../templates/totals";

type Expense = Schemas["Expense"];
type IncomeEntry = Schemas["IncomeEntry"];

export interface PreviewPaycheck {
  id: string;
  sourceName: string;
  label: string | null;
  day: number;
  netCents: number;
  /** Net from the same source and label last month, for reference; null when there was none. */
  previousCents: number | null;
}

export interface PreviewBill {
  id: string;
  merchant: string;
  categoryName: string;
  isSaving: boolean;
  day: number;
  amountCents: number;
  /** Spent at the same merchant last month (refunds included); null when nothing was. */
  previousCents: number | null;
}

export interface TemplatePreview {
  paychecks: PreviewPaycheck[];
  bills: PreviewBill[];
  totals: TemplateTotals;
  /** Last month's actual net income, spending and left over, for reference. */
  previous: { netCents: number; spentCents: number; leftOverCents: number };
}

const sameLabel = (a: string | null, b: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

const sumOrNull = (values: number[]) => (values.length === 0 ? null : values.reduce((t, v) => t + v, 0));

/**
 * What "Start <Month> from your template?" shows: every paycheck and bill
 * the template would copy, in day order, beside last month's figures.
 * All sums are integer cents.
 */
export function templatePreview(
  template: Schemas["Template"],
  categories: Schemas["Category"][],
  sources: Schemas["IncomeSource"][],
  previousExpenses: Expense[],
  previousIncome: IncomeEntry[],
): TemplatePreview {
  const category = new Map(categories.map((c) => [c.id, c]));
  const source = new Map(sources.map((s) => [s.id, s]));
  const byDay = <T extends { day_of_month: number; sort_order: number }>(items: T[]) =>
    [...items].sort((a, b) => a.day_of_month - b.day_of_month || a.sort_order - b.sort_order);

  const paychecks = byDay(template.income_items).map((i) => ({
    id: i.id,
    sourceName: source.get(i.income_source_id)?.name ?? "—",
    label: i.note,
    day: i.day_of_month,
    netCents: i.net_cents,
    previousCents: sumOrNull(
      previousIncome.filter((e) => e.income_source_id === i.income_source_id && sameLabel(e.note, i.note)).map((e) => e.net_cents),
    ),
  }));
  const bills = byDay(template.expense_items).map((i) => ({
    id: i.id,
    merchant: i.merchant.name,
    categoryName: category.get(i.category_id)?.name ?? "—",
    isSaving: category.get(i.category_id)?.is_saving ?? false,
    day: i.day_of_month,
    amountCents: i.amount_cents,
    previousCents: sumOrNull(previousExpenses.filter((e) => e.merchant.id === i.merchant.id).map((e) => e.amount_cents)),
  }));

  const netCents = previousIncome.reduce((t, e) => t + e.net_cents, 0);
  const spentCents = previousExpenses.reduce((t, e) => t + e.amount_cents, 0);
  return {
    paychecks,
    bills,
    totals: templateTotals(template, categories),
    previous: { netCents, spentCents, leftOverCents: netCents - spentCents },
  };
}

/** How many of the month's entries are still unconfirmed. */
export function unconfirmedCount(expenses: Expense[], income: IncomeEntry[]): number {
  return expenses.filter((e) => !e.confirmed).length + income.filter((e) => !e.confirmed).length;
}

/** The newest apply that Undo would still remove something from (applies come newest first). */
export function undoableApply(applies: Schemas["TemplateApply"][]): Schemas["TemplateApply"] | null {
  return applies.find((a) => a.unconfirmed_count > 0) ?? null;
}

/** The template a new month offers by default: the first one with items, else the first. */
export function defaultTemplate(templates: Schemas["TemplateSummary"][]): Schemas["TemplateSummary"] | null {
  return templates.find((t) => t.expense_item_count + t.income_item_count > 0) ?? templates[0] ?? null;
}

const count = new Intl.NumberFormat("en-US");
export const plural = (n: number, one: string, many: string) => `${count.format(n)} ${n === 1 ? one : many}`;

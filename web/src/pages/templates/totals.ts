import type { Schemas } from "../../api";

type Template = Schemas["Template"];
type ExpenseItem = Schemas["TemplateExpenseItem"];
type Category = Schemas["Category"];

export interface TemplateTotals {
  grossCents: number;
  grossTaxableCents: number;
  netCents: number;
  /** Every expense item, Saving included (Saving counts as an expense). */
  spentCents: number;
  savingCents: number;
  /** Net income − planned spending. */
  leftOverCents: number;
}

/** A template's planned month, summed in integer cents. */
export function templateTotals(template: Template, categories: Category[]): TemplateTotals {
  const saving = new Set(categories.filter((c) => c.is_saving).map((c) => c.id));
  const sum = <T>(items: T[], pick: (item: T) => number) => items.reduce((total, item) => total + pick(item), 0);
  const netCents = sum(template.income_items, (i) => i.net_cents);
  const spentCents = sum(template.expense_items, (i) => i.amount_cents);
  return {
    grossCents: sum(template.income_items, (i) => i.gross_cents),
    grossTaxableCents: sum(template.income_items, (i) => i.gross_taxable_cents),
    netCents,
    spentCents,
    savingCents: sum(
      template.expense_items.filter((i) => saving.has(i.category_id)),
      (i) => i.amount_cents,
    ),
    leftOverCents: netCents - spentCents,
  };
}

export interface CategoryGroup {
  category: Category;
  items: ExpenseItem[];
  subtotalCents: number;
}

/**
 * Expense items grouped under every category, in the categories' order
 * (empty ones too, so items can be added to them). Items keep their
 * `sort_order` within a group. An item whose category isn't in the list
 * (a stale cache) is shown under Other rather than hidden.
 */
export function groupByCategory(items: ExpenseItem[], categories: Category[]): CategoryGroup[] {
  const known = new Set(categories.map((c) => c.id));
  const other = categories.find((c) => c.is_protected)?.id;
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
  return categories.map((category) => {
    const mine = sorted.filter(
      (i) => i.category_id === category.id || (category.id === other && !known.has(i.category_id)),
    );
    return { category, items: mine, subtotalCents: mine.reduce((t, i) => t + i.amount_cents, 0) };
  });
}

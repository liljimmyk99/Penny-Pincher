import type { Schemas } from "../../api";

/**
 * Display-only sums for the Transactions screen, in integer cents. Refunds are
 * negative, so they lower their own category in the month they are logged
 * (root AGENTS.md §5). Nothing here is stored.
 */

export interface CategoryTotal {
  category: Schemas["Category"];
  totalCents: number;
  /** Expenses and refunds in the category this month. */
  count: number;
}

/** One row per category with entries this month, in the user's category order. */
export function categoryTotals(expenses: Schemas["Expense"][], categories: Schemas["Category"][]): CategoryTotal[] {
  const sums = new Map<string, { totalCents: number; count: number }>();
  for (const e of expenses) {
    const t = sums.get(e.category_id) ?? { totalCents: 0, count: 0 };
    sums.set(e.category_id, { totalCents: t.totalCents + e.amount_cents, count: t.count + 1 });
  }
  return categories.flatMap((category) => {
    const t = sums.get(category.id);
    return t ? [{ category, ...t }] : [];
  });
}

export function sumCents(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0);
}

export interface IncomeTotals {
  grossCents: number;
  taxableCents: number;
  netCents: number;
}

export function incomeTotals(entries: Schemas["IncomeEntry"][]): IncomeTotals {
  return {
    grossCents: sumCents(entries.map((e) => e.gross_cents)),
    taxableCents: sumCents(entries.map((e) => e.gross_taxable_cents)),
    netCents: sumCents(entries.map((e) => e.net_cents)),
  };
}

/** Case-insensitive match on the merchant name or the note. An empty query matches everything. */
export function matchesSearch(expense: Schemas["Expense"], query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  return (
    expense.merchant.name.toLocaleLowerCase().includes(q) || (expense.note ?? "").toLocaleLowerCase().includes(q)
  );
}

/** A category's share of the month's spending, "34%"; "—" when nothing was spent. */
export function shareOf(partCents: number, totalCents: number): string {
  if (totalCents <= 0) return "—";
  return `${Math.round((partCents / totalCents) * 100)}%`;
}

/** Bar length as a percent of the largest positive total; categories that net to zero or less get no bar. */
export function barPercent(cents: number, maxCents: number): number {
  if (cents <= 0 || maxCents <= 0) return 0;
  return Math.max(2, Math.round((cents / maxCents) * 100));
}

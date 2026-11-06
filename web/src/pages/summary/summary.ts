import type { Schemas } from "../../api";

type Category = Schemas["MonthlySummary"]["spending"]["categories"][number];

/** Categories with spending this month, largest first (refunds can net a category to zero or below; those get no bar). */
export function rankedCategories(categories: Category[]): Category[] {
  return categories.filter((c) => c.total_cents > 0).sort((a, b) => b.total_cents - a.total_cents);
}

/** A category's share of combined net income, "34%"; "—" when there is no income. */
export function percentOfIncome(totalCents: number, netIncomeCents: number): string {
  if (netIncomeCents <= 0) return "—";
  return `${Math.round((totalCents / netIncomeCents) * 100)}%`;
}

/** Bar length as a percent of the largest total, with a visible minimum. */
export function barWidth(cents: number, maxCents: number): number {
  if (cents <= 0 || maxCents <= 0) return 0;
  return Math.max(2, Math.round((cents / maxCents) * 100));
}

/** Fallback slice colours (tokens.css `--chart-N`) for categories without a colour of their own. */
export const CHART_PALETTE_SIZE = 8;

/** The colour for a category's bar or slice. Saving always keeps its own colour. */
export function categoryColor(category: Pick<Category, "is_saving" | "color">, index: number): string {
  if (category.is_saving) return "var(--color-saving-bar)";
  return category.color ?? `var(--chart-${(index % CHART_PALETTE_SIZE) + 1})`;
}

export interface DonutSlice {
  id: string;
  from: number;
  to: number;
  color: string;
}

/** Slices of the spending donut, in ranked order, as percentages of the positive total. */
export function donutSlices(ranked: Category[]): DonutSlice[] {
  const total = ranked.reduce((sum, c) => sum + c.total_cents, 0);
  if (total <= 0) return [];
  let used = 0;
  return ranked.map((c, i) => {
    const from = (used / total) * 100;
    used += c.total_cents;
    return { id: c.category_id, from, to: (used / total) * 100, color: categoryColor(c, i) };
  });
}

/** The CSS `conic-gradient(...)` for those slices. */
export function donutGradient(slices: DonutSlice[]): string {
  if (slices.length === 0) return "conic-gradient(var(--color-divider) 0 100%)";
  return `conic-gradient(${slices.map((s) => `${s.color} ${s.from.toFixed(3)}% ${s.to.toFixed(3)}%`).join(", ")})`;
}

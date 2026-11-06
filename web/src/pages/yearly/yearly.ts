import type { Schemas } from "../../api";

export type Yearly = Schemas["YearlySummary"];

/** `total ÷ count` in integer cents, rounded half away from zero (as the API does for category averages). */
export function averageCents(totalCents: number, monthCount: number): number {
  if (monthCount <= 0) return 0;
  const q = Math.floor(Math.abs(totalCents) / monthCount);
  const r = Math.abs(totalCents) % monthCount;
  const rounded = r * 2 >= monthCount ? q + 1 : q;
  return totalCents < 0 ? -rounded : rounded;
}

/** Categories with a positive monthly average, largest first. */
export function rankedAverages(categories: Yearly["categories"]): Yearly["categories"] {
  return categories.filter((c) => c.monthly_average_cents > 0).sort((a, b) => b.monthly_average_cents - a.monthly_average_cents);
}

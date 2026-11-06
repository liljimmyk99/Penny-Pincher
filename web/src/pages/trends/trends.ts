import type { Schemas } from "../../api";
import { monthBounds, shiftMonth } from "../../lib/dates";

type Trend = Schemas["SavedTrend"];
type Bucket = Schemas["CustomTrend"]["buckets"][number];
export type Measure = Schemas["TrendMeasure"];

/** How many months a trend is charted over, ending with the current month. */
export const TREND_MONTHS = 12;

/** The last twelve months, current month included. */
export function trendRange(currentMonth: string) {
  return { from: monthBounds(shiftMonth(currentMonth, 1 - TREND_MONTHS)).first, to: monthBounds(currentMonth).last };
}

/** The value a bucket charts for a measure (cents, or a count of expenses). */
export const valueOf = (b: Bucket, measure: Measure) => (measure === "count" ? b.count : b.total_cents);

/** "Merchant: Name", "Category: Name" or "Note contains “text”". */
export function describeMatch(t: Trend, merchantName: string | null, categoryName: string | null): string {
  if (t.match_type === "merchant") return `Merchant: ${merchantName ?? "—"}`;
  if (t.match_type === "category") return `Category: ${categoryName ?? "—"}`;
  return `Note contains “${t.match_text ?? ""}”`;
}

/** Does this expense or refund belong to the trend? (Mirrors the API's filter.) */
export function matchesTrend(e: Schemas["Expense"], t: Pick<Trend, "match_type" | "merchant_id" | "category_id" | "match_text">): boolean {
  if (t.match_type === "merchant") return e.merchant.id === t.merchant_id;
  if (t.match_type === "category") return e.category_id === t.category_id;
  return (e.note ?? "").toLocaleLowerCase().includes((t.match_text ?? "").toLocaleLowerCase());
}

/** Address of the Transactions screen narrowed to a trend's matches in a month. */
export function transactionsLink(t: Trend, month: string, merchantName: string | null): string {
  const p = new URLSearchParams({ month });
  if (t.match_type === "category" && t.category_id) p.set("category", t.category_id);
  if (t.match_type === "merchant" && merchantName) p.set("q", merchantName);
  if (t.match_type === "note" && t.match_text) p.set("q", t.match_text);
  return `/transactions?${p.toString()}`;
}

export interface TrendStats {
  /** Total for the calendar year of `currentMonth`, in the chosen measure. */
  ytd: number;
  /** Mean per month since the first month with a match, through the current month. */
  monthlyAverage: number;
  /** The current month and the one before it, for the change indicator. */
  current: number;
  previous: number;
  peak: { period: string; value: number } | null;
  /** Total spent ÷ number of expenses (cents), null when there were none. */
  perVisitCents: number | null;
  /** First month in the range with a match. */
  since: string | null;
}

export function trendStats(buckets: Bucket[], measure: Measure, currentMonth: string): TrendStats {
  const year = currentMonth.slice(0, 4);
  const values = buckets.map((b) => valueOf(b, measure));
  const firstHit = buckets.findIndex((b) => b.total_cents !== 0 || b.count !== 0);
  const tracked = firstHit < 0 ? [] : values.slice(firstHit);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  let peak: TrendStats["peak"] = null;
  buckets.forEach((b, i) => {
    if (values[i] > 0 && (!peak || values[i] > peak.value)) peak = { period: b.period, value: values[i] };
  });
  const totalCents = sum(buckets.map((b) => b.total_cents));
  const visits = sum(buckets.map((b) => b.count));
  const at = (month: string) => {
    const i = buckets.findIndex((b) => b.period === month);
    return i < 0 ? 0 : values[i];
  };
  return {
    ytd: sum(buckets.flatMap((b, i) => (b.period.startsWith(year) ? [values[i]] : []))),
    monthlyAverage: tracked.length ? Math.round(sum(tracked) / tracked.length) : 0,
    current: at(currentMonth),
    previous: at(shiftMonth(currentMonth, -1)),
    peak,
    perVisitCents: visits > 0 ? Math.round(totalCents / visits) : null,
    since: firstHit < 0 ? null : buckets[firstHit].period,
  };
}

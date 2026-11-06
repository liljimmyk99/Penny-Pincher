import { describe, expect, it } from "vitest";
import { matchesTrend, transactionsLink, trendRange, trendStats } from "./trends";

const bucket = (period: string, total_cents: number, count: number) => ({ period, total_cents, count });
const trend = { id: "t", name: "T", match_type: "merchant", merchant_id: "m1", category_id: null, match_text: null, measure: "amount", sort_order: 0, created_at: "", updated_at: "" } as const;

describe("trendRange", () => {
  it("covers twelve months ending with the current one", () => {
    expect(trendRange("2026-03")).toEqual({ from: "2025-04-01", to: "2026-03-31" });
  });
});

describe("trendStats", () => {
  const buckets = [bucket("2025-12", 0, 0), bucket("2026-01", 1000, 1), bucket("2026-02", 0, 0), bucket("2026-03", 3000, 2)];
  it("computes totals, average since first match, peak and per-visit", () => {
    const s = trendStats(buckets, "amount", "2026-03");
    expect(s.ytd).toBe(4000);
    expect(s.monthlyAverage).toBe(1333);
    expect(s.current).toBe(3000);
    expect(s.previous).toBe(0);
    expect(s.peak).toEqual({ period: "2026-03", value: 3000 });
    expect(s.perVisitCents).toBe(1333);
    expect(s.since).toBe("2026-01");
  });
  it("uses counts when asked, and handles no matches", () => {
    expect(trendStats(buckets, "count", "2026-03").ytd).toBe(3);
    const none = trendStats([bucket("2026-03", 0, 0)], "amount", "2026-03");
    expect(none).toMatchObject({ peak: null, perVisitCents: null, since: null, monthlyAverage: 0 });
  });
});

describe("matching", () => {
  const e = { merchant: { id: "m1", name: "Shop" }, category_id: "c1", note: "Weekly Run" } as never;
  it("matches by merchant, category and note text", () => {
    expect(matchesTrend(e, trend)).toBe(true);
    expect(matchesTrend(e, { ...trend, merchant_id: "m2" })).toBe(false);
    expect(matchesTrend(e, { ...trend, match_type: "category", category_id: "c1" })).toBe(true);
    expect(matchesTrend(e, { ...trend, match_type: "note", match_text: "weekly" })).toBe(true);
  });
  it("links to Transactions", () => {
    expect(transactionsLink(trend, "2026-03", "Shop")).toBe("/transactions?month=2026-03&q=Shop");
    expect(transactionsLink({ ...trend, match_type: "category", category_id: "c1" }, "2026-03", null)).toBe("/transactions?month=2026-03&category=c1");
  });
});

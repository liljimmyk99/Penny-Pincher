import type { Schemas } from "../../api";
import { matchesRefundFilter, originalStatus, refundTag, refundTotals, suggestOriginal } from "./refunds";

const stamp = "2020-01-01T00:00:00Z";

function expense(id: string, extra: Partial<Schemas["Expense"]> = {}): Schemas["Expense"] {
  const amount = extra.amount_cents ?? 5000;
  return {
    id,
    date: "2020-03-10",
    amount_cents: amount,
    type: amount < 0 ? "refund" : "expense",
    category_id: "2",
    merchant: { id: "m1", name: "Corner Store" },
    note: null,
    refunded_expense_id: null,
    refunded_total_cents: 0,
    last_refund_date: null,
    confirmed: true,
    template_apply_id: null,
    import_id: null,
    created_at: stamp,
    updated_at: stamp,
    ...extra,
  };
}

describe("refundTag", () => {
  const original = expense("o", { date: "2020-03-02", amount_cents: 5000 });

  it("says Not linked for a refund without an original", () => {
    expect(refundTag(expense("r", { amount_cents: -500 }), undefined)).toEqual({ kind: "unlinked", label: "Not linked" });
  });

  it("waits for the original before choosing a tag", () => {
    expect(refundTag(expense("r", { amount_cents: -500, refunded_expense_id: "o" }), undefined)).toBeNull();
  });

  it("tells full from partial refunds by the refund's own amount", () => {
    const full = expense("r", { amount_cents: -5000, refunded_expense_id: "o" });
    const partial = expense("r", { amount_cents: -1200, refunded_expense_id: "o" });
    expect(refundTag(full, original)?.label).toBe("Full refund");
    expect(refundTag(partial, original)?.label).toBe("Partial refund");
  });

  it("names the original's month when it is earlier, with the year when it differs", () => {
    const refund = expense("r", { amount_cents: -5000, refunded_expense_id: "o" });
    expect(refundTag(refund, { ...original, date: "2020-02-27" })).toEqual({ kind: "earlier", label: "From February" });
    expect(refundTag(refund, { ...original, date: "2019-12-27" })?.label).toBe("From December 2019");
  });
});

describe("originalStatus", () => {
  it("is null for expenses without refunds, and for refunds", () => {
    expect(originalStatus(expense("e"))).toBeNull();
    expect(originalStatus(expense("r", { amount_cents: -500 }))).toBeNull();
  });

  it("shows a partial refund's amount, date and display-only net", () => {
    const e = expense("e", { amount_cents: 4850, refunded_total_cents: -1200, last_refund_date: "2020-03-14" });
    expect(originalStatus(e)).toEqual({ full: false, netCents: 3650, text: "Partly refunded · −$12.00 on Mar 14 · net $36.50" });
  });

  it("marks an expense refunded in full, across several refunds", () => {
    const e = expense("e", { amount_cents: 2499, refunded_total_cents: -2499, last_refund_date: "2020-04-02" });
    expect(originalStatus(e)).toEqual({ full: true, netCents: 0, text: "Refunded in full on Apr 2 · net $0.00" });
  });
});

describe("refundTotals and filters", () => {
  const list = [
    expense("a", { amount_cents: 10000 }),
    expense("b", { amount_cents: 2500 }),
    expense("r1", { amount_cents: -1500, refunded_expense_id: "a" }),
    expense("r2", { amount_cents: -499 }),
  ];

  it("sums refunds and spending before and after them, in cents", () => {
    expect(refundTotals(list)).toEqual({ refundCents: -1999, refundCount: 2, linkedCount: 1, beforeCents: 12500, afterCents: 10501 });
  });

  it("filters to refunds or unlinked refunds", () => {
    expect(list.filter((e) => matchesRefundFilter(e, "refunds")).map((e) => e.id)).toEqual(["r1", "r2"]);
    expect(list.filter((e) => matchesRefundFilter(e, "unlinked")).map((e) => e.id)).toEqual(["r2"]);
    expect(list.filter((e) => matchesRefundFilter(e, null))).toHaveLength(4);
  });
});

describe("suggestOriginal", () => {
  const refund = expense("r", { date: "2020-03-20", amount_cents: -2000 });

  it("picks the closest same-category expense on or before the refund that can cover it", () => {
    const candidates = [
      expense("later", { date: "2020-03-21" }),
      expense("other-cat", { date: "2020-03-19", category_id: "3" }),
      expense("too-small", { date: "2020-03-18", amount_cents: 1500 }),
      expense("used-up", { date: "2020-03-17", amount_cents: 3000, refunded_total_cents: -1500 }),
      expense("closest", { date: "2020-03-15" }),
      expense("older", { date: "2020-03-01" }),
    ];
    expect(suggestOriginal(refund, candidates)?.id).toBe("closest");
  });

  it("suggests nothing when no expense fits", () => {
    expect(suggestOriginal(refund, [expense("x", { category_id: "9" })])).toBeNull();
  });
});

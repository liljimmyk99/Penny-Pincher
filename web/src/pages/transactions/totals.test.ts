import type { Schemas } from "../../api";
import { barPercent, categoryTotals, incomeTotals, matchesSearch, shareOf } from "./totals";

const stamp = "2020-01-01T00:00:00Z";

const category = (id: string, name: string): Schemas["Category"] => ({
  id,
  name,
  color: null,
  is_saving: false,
  is_protected: false,
  sort_order: Number(id),
  created_at: stamp,
  updated_at: stamp,
});

const expense = (id: string, categoryId: string, cents: number, extra: Partial<Schemas["Expense"]> = {}): Schemas["Expense"] => ({
  id,
  date: "2020-03-10",
  amount_cents: cents,
  type: cents < 0 ? "refund" : "expense",
  category_id: categoryId,
  merchant: { id: "m1", name: "Corner Store" },
  note: null,
  refunded_expense_id: null,
  refunded_total_cents: 0,
  last_refund_date: null,
  confirmed: true,
  template_apply_id: null,
  created_at: stamp,
  updated_at: stamp,
  ...extra,
});

describe("categoryTotals", () => {
  it("sums each category in the user's order, refunds lowering their own category", () => {
    const cats = [category("1", "Food"), category("2", "Household"), category("3", "Other")];
    const rows = categoryTotals([expense("a", "2", 5000), expense("b", "1", 1200), expense("c", "2", -2000)], cats);
    expect(rows.map((r) => [r.category.name, r.totalCents, r.count])).toEqual([
      ["Food", 1200, 1],
      ["Household", 3000, 2],
    ]);
  });
});

describe("incomeTotals", () => {
  it("adds gross, taxable and net", () => {
    const entry = (gross: number, taxable: number, net: number) =>
      ({ gross_cents: gross, gross_taxable_cents: taxable, net_cents: net }) as Schemas["IncomeEntry"];
    expect(incomeTotals([entry(100000, 90000, 70000), entry(5000, 0, 5000)])).toEqual({
      grossCents: 105000,
      taxableCents: 90000,
      netCents: 75000,
    });
  });
});

describe("matchesSearch", () => {
  it("matches merchant or note, case-insensitively", () => {
    const e = expense("a", "1", 100, { note: "Weekly Groceries" });
    expect(matchesSearch(e, "corner")).toBe(true);
    expect(matchesSearch(e, "GROC")).toBe(true);
    expect(matchesSearch(e, "  ")).toBe(true);
    expect(matchesSearch(e, "fuel")).toBe(false);
    expect(matchesSearch(expense("b", "1", 100), "groc")).toBe(false);
  });
});

describe("shareOf and barPercent", () => {
  it("rounds shares and shows nothing when nothing was spent", () => {
    expect(shareOf(2500, 10000)).toBe("25%");
    expect(shareOf(-500, 0)).toBe("—");
  });

  it("sizes bars against the largest total and hides non-positive ones", () => {
    expect(barPercent(5000, 10000)).toBe(50);
    expect(barPercent(1, 100000)).toBe(2);
    expect(barPercent(-100, 10000)).toBe(0);
  });
});

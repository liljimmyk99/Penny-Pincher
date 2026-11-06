import type { Schemas } from "../../api";
import { barWidth, donutGradient, donutSlices, percentOfIncome, rankedCategories } from "./summary";

type Category = Schemas["MonthlySummary"]["spending"]["categories"][number];
const cat = (id: string, total: number, extra: Partial<Category> = {}): Category => ({
  category_id: id,
  name: id,
  color: null,
  is_saving: false,
  is_protected: false,
  total_cents: total,
  expense_count: 1,
  refund_count: 0,
  previous_month_total_cents: 0,
  ...extra,
});

describe("summary helpers", () => {
  it("ranks categories by spending and drops those that net to zero or less", () => {
    const ranked = rankedCategories([cat("a", 100), cat("b", 300), cat("c", 0), cat("d", -50)]);
    expect(ranked.map((c) => c.category_id)).toEqual(["b", "a"]);
  });

  it("shows percent of net income, or a dash without income", () => {
    expect(percentOfIncome(25000, 100000)).toBe("25%");
    expect(percentOfIncome(25000, 0)).toBe("—");
  });

  it("scales bars to the largest, with a minimum width", () => {
    expect(barWidth(300, 300)).toBe(100);
    expect(barWidth(1, 1000)).toBe(2);
    expect(barWidth(0, 1000)).toBe(0);
  });

  it("gives Saving its own colour in the donut", () => {
    const ranked = [cat("a", 750), cat("s", 250, { is_saving: true })];
    const slices = donutSlices(ranked);
    expect(slices.map((s) => [s.from, s.to])).toEqual([
      [0, 75],
      [75, 100],
    ]);
    expect(slices[1].color).toBe("var(--color-saving-bar)");
    expect(donutGradient(slices)).toContain("var(--color-saving-bar) 75.000% 100.000%");
  });

  it("draws an empty ring when there is nothing to chart", () => {
    expect(donutSlices([])).toEqual([]);
    expect(donutGradient([])).toBe("conic-gradient(var(--color-divider) 0 100%)");
  });
});

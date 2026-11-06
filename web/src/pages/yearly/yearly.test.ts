import { averageCents, rankedAverages } from "./yearly";

describe("averageCents", () => {
  it("rounds half away from zero", () => {
    expect(averageCents(5, 2)).toBe(3);
    expect(averageCents(-5, 2)).toBe(-3);
    expect(averageCents(10, 3)).toBe(3);
    expect(averageCents(11, 3)).toBe(4);
  });
  it("is 0 with no months", () => expect(averageCents(1000, 0)).toBe(0));
});

describe("rankedAverages", () => {
  it("drops zero averages and sorts descending", () => {
    const c = (id: string, avg: number) => ({ category_id: id, name: id, color: null, is_saving: false, is_protected: false, total_cents: avg, monthly_average_cents: avg });
    expect(rankedAverages([c("a", 5), c("b", 0), c("c", 9)]).map((x) => x.category_id)).toEqual(["c", "a"]);
  });
});

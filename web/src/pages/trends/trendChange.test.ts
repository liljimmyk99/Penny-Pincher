import { biggestMovers, defaultMonthIndex, monthFigures, seriesTone, type Series } from "./trendChange";

const mk = (name: string, is_saving: boolean, thisYear: number[], lastYear: number[]): Series => ({
  category_id: name, name, color: null, is_saving,
  this_year_cents: [...thisYear, ...Array(12 - thisYear.length).fill(0)],
  last_year_cents: [...lastYear, ...Array(12 - lastYear.length).fill(0)],
}) as Series;

describe("change-indicator tones in category trends", () => {
  it("spending up is worse, down is better", () => {
    expect(seriesTone({ is_saving: false }, 200, 100)).toBe("worse");
    expect(seriesTone({ is_saving: false }, 50, 100)).toBe("better");
  });
  it("flips for Saving: saving more is better", () => {
    expect(seriesTone({ is_saving: true }, 200, 100)).toBe("better");
    expect(seriesTone({ is_saving: true }, 50, 100)).toBe("worse");
  });
  it("no change has no tone", () => {
    expect(seriesTone({ is_saving: true }, 100, 100)).toBe("none");
  });
});

describe("monthFigures", () => {
  const s = mk("Food", false, [100, 200, 300], [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
  it("January compares with last December", () => {
    expect(monthFigures(s, 0)).toMatchObject({ spend: 100, previousMonth: 120, sameMonthLastYear: 10, ytd: 100, ytdLastYear: 10 });
  });
  it("sums year to date for both years", () => {
    expect(monthFigures(s, 2)).toMatchObject({ spend: 300, previousMonth: 200, sameMonthLastYear: 30, ytd: 600, ytdLastYear: 60 });
  });
});

describe("biggestMovers", () => {
  it("ranks by absolute change, drops unchanged, and flips Saving's tone", () => {
    const cats = [
      mk("Food", false, [150], [100]),
      mk("Fun", false, [10], [300]),
      mk("Saving", true, [500], [100]),
      mk("Rent", false, [90], [90]),
    ];
    const m = biggestMovers(cats, 0);
    expect(m.map((x) => x.series.name)).toEqual(["Saving", "Fun", "Food"]);
    expect(m.map((x) => x.tone)).toEqual(["better", "better", "worse"]);
  });
});

describe("defaultMonthIndex", () => {
  it("is the current month this year, else December", () => {
    expect(defaultMonthIndex(2026, "2026-03-15")).toBe(2);
    expect(defaultMonthIndex(2025, "2026-03-15")).toBe(11);
  });
});

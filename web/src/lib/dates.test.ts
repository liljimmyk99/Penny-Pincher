import {
  addDays,
  defaultDateFor,
  formatMonth,
  formatShortDate,
  isDate,
  isMonth,
  monthBounds,
  shiftMonth,
  todayISO,
} from "./dates";

describe("dates", () => {
  it("adds days across month, year and leap-day boundaries", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2026-01-15", -90)).toBe("2025-10-17");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("reads today from local calendar fields", () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("shifts months across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(shiftMonth("2026-05", -17)).toBe("2024-12");
  });

  it("knows month lengths, including leap years", () => {
    expect(monthBounds("2026-02")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(monthBounds("2028-02").last).toBe("2028-02-29");
    expect(monthBounds("2026-10").last).toBe("2026-10-31");
  });

  it("validates dates and months", () => {
    expect(isDate("2026-02-28")).toBe(true);
    expect(isDate("2026-02-30")).toBe(false);
    expect(isDate("2026-13-01")).toBe(false);
    expect(isMonth("2026-10")).toBe(true);
    expect(isMonth("2026-1")).toBe(false);
  });

  it("defaults new entries to today in the current month, else the 1st", () => {
    expect(defaultDateFor("2026-10", "2026-10-29")).toBe("2026-10-29");
    expect(defaultDateFor("2026-09", "2026-10-29")).toBe("2026-09-01");
  });

  it("formats months and short dates", () => {
    expect(formatMonth("2026-10")).toBe("October 2026");
    expect(formatShortDate("2026-10-03")).toBe("Oct 3");
  });
});

import { centsToInput, formatCents, parseCents } from "./money";

describe("formatCents", () => {
  it.each([
    [0, "$0.00"],
    [5, "$0.05"],
    [100, "$1.00"],
    [123456, "$1,234.56"],
    [100000000, "$1,000,000.00"],
  ])("formats %i as %s", (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });

  it("puts the sign before the symbol for negatives (refunds)", () => {
    expect(formatCents(-500)).toBe("−$5.00");
    expect(formatCents(-1)).toBe("−$0.01");
  });

  it("never shows a sign for zero", () => {
    expect(formatCents(0, { showPlus: true })).toBe("$0.00");
  });

  it("supports an explicit plus sign", () => {
    expect(formatCents(250, { showPlus: true })).toBe("+$2.50");
    expect(formatCents(-250, { showPlus: true })).toBe("−$2.50");
  });

  it("can omit the currency symbol", () => {
    expect(formatCents(123456, { hideSymbol: true })).toBe("1,234.56");
  });

  it("is exact for the largest safe integer", () => {
    expect(formatCents(Number.MAX_SAFE_INTEGER)).toBe("$90,071,992,547,409.91");
  });

  it.each([1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 2])(
    "rejects non-integer or unsafe input %s",
    (bad) => {
      expect(() => formatCents(bad)).toThrow(RangeError);
    },
  );
});

describe("parseCents", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12.05", 1205],
    ["0.01", 1],
    [".99", 99],
    ["8.", 800],
    ["$1,234.56", 123456],
    ["1234.56", 123456],
    ["  42.10 ", 4210],
    ["-24.99", -2499],
    ["−24.99", -2499],
    ["-$5", -500],
    ["+3", 300],
    ["0", 0],
  ])("parses %j as %i cents", (input, expected) => {
    expect(parseCents(input)).toBe(expected);
  });

  it.each(["", " ", "abc", "1.234", "12,34", "1,2345", "$", "-", ".", "1e3", "12.3.4", "--1"])(
    "rejects %j",
    (input) => {
      expect(parseCents(input)).toBeNull();
    },
  );

  it("never goes through floats (0.29 and 1.15 stay exact)", () => {
    expect(parseCents("0.29")).toBe(29);
    expect(parseCents("1.15")).toBe(115);
    expect(parseCents("4.35")).toBe(435);
  });
});

describe("centsToInput", () => {
  it.each([
    [0, "0.00"],
    [5, "0.05"],
    [123456, "1234.56"],
    [-500, "-5.00"],
  ])("formats %i as %j", (cents, expected) => {
    expect(centsToInput(cents)).toBe(expected);
  });

  it("round-trips with parseCents", () => {
    for (const cents of [0, 1, 99, 100, 2499, -2499, 123456789]) {
      expect(parseCents(centsToInput(cents))).toBe(cents);
    }
  });
});

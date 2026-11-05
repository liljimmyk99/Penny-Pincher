import { formatCents } from "./money";

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

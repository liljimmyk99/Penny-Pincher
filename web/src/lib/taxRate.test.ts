import { formatTaxRate, taxRate } from "./taxRate";

describe("taxRate", () => {
  it("is (gross taxable − net) ÷ gross taxable", () => {
    expect(taxRate(10000, 7500)).toBe(0.25);
    expect(formatTaxRate(300000, 220000)).toBe("26.7%");
  });

  it("shows nothing when gross taxable is 0", () => {
    expect(taxRate(0, 0)).toBeNull();
    expect(formatTaxRate(0, 5000)).toBe("—");
  });

  it("is 0% when taxable income is untaxed", () => {
    expect(formatTaxRate(5000, 5000)).toBe("0.0%");
  });
});

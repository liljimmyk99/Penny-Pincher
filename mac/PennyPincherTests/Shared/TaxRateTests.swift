import Testing
@testable import PennyPincher

@Suite("Tax rate")
struct TaxRateTests {
    @Test("(taxable − net) ÷ taxable, to one decimal", arguments: [
        (2_000, 1_532, "23.4%"), (100_000, 70_000, "30.0%"), (3, 2, "33.3%"), (2_000, 1_999, "0.1%"), (1_000, 1_000, "0.0%"),
    ])
    func rate(taxable: Int, net: Int, expected: String) {
        #expect(TaxRate.format(grossTaxableCents: taxable, netCents: net) == expected)
    }

    @Test("Nothing when gross taxable is zero")
    func zero() {
        #expect(TaxRate.permille(grossTaxableCents: 0, netCents: 0) == nil)
        #expect(TaxRate.format(grossTaxableCents: 0, netCents: 500) == "—")
    }

    @Test("Rounds half up")
    func rounding() {
        // 1 cent of tax on 8 cents taxable is 12.5%.
        #expect(TaxRate.format(grossTaxableCents: 8, netCents: 7) == "12.5%")
        // 1 of 16 is 6.25%, which rounds to 6.3%.
        #expect(TaxRate.format(grossTaxableCents: 16, netCents: 15) == "6.3%")
    }
}

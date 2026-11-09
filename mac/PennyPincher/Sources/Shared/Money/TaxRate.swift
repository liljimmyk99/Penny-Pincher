/// Tax rate is derived, never stored (root AGENTS.md §5):
/// (gross taxable − net) ÷ gross taxable, and nothing when gross taxable is 0.
enum TaxRate {
    /// Tenths of a percent, rounded half up, so no `Double` touches the cents:
    /// 2000 taxable and 1532 net → 234 (23.4%).
    static func permille(grossTaxableCents: Int, netCents: Int) -> Int? {
        guard grossTaxableCents > 0 else { return nil }
        let tax = grossTaxableCents - netCents
        let scaled = tax * 1000
        let rounded = (scaled * 2 + (scaled >= 0 ? grossTaxableCents : -grossTaxableCents)) / (2 * grossTaxableCents)
        return rounded
    }

    /// `"23.4%"`, or `"—"` when there is no rate to show.
    static func format(grossTaxableCents: Int, netCents: Int) -> String {
        guard let value = permille(grossTaxableCents: grossTaxableCents, netCents: netCents) else { return "—" }
        let sign = value < 0 ? Money.minus : ""
        return "\(sign)\(value.magnitude / 10).\(value.magnitude % 10)%"
    }
}

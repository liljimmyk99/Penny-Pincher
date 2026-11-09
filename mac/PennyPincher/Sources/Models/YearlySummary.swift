/// `YearlySummary` in api/openapi.yaml: twelve zero-filled months, category
/// totals and averages, and the year's totals.
struct YearlySummary: Equatable, Sendable {
    struct Month: Identifiable, Equatable, Sendable {
        /// `YYYY-MM`.
        var month: String
        var grossCents: Int
        var grossTaxableCents: Int
        var netCents: Int
        var spentCents: Int
        var savingCents: Int
        var leftOverCents: Int
        var hasEntries: Bool

        var id: String { month }
    }

    struct Category: Identifiable, Equatable, Sendable {
        var id: String
        var name: String
        var color: String?
        var isSaving: Bool
        var isProtected: Bool
        var totalCents: Int
        var monthlyAverageCents: Int
    }

    struct Totals: Equatable, Sendable {
        var grossCents: Int
        var grossTaxableCents: Int
        var netCents: Int
        var spentCents: Int
        var savingCents: Int
        var leftOverCents: Int
    }

    var year: Int
    var months: [Month]
    var categories: [Category]
    var totals: Totals
    /// Months with any entries: the divisor for monthly averages.
    var averageMonthCount: Int
}

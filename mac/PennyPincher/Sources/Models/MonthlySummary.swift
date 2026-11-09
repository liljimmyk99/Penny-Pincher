/// `MonthlySummary` in api/openapi.yaml: one month's income per source, spending
/// per category (net of refunds logged that month) and what is unconfirmed.
/// Tax rate, percent of income and changes are derived by the client.
struct MonthlySummary: Equatable, Sendable {
    struct Source: Identifiable, Equatable, Sendable {
        var id: String
        var name: String
        var isProtected: Bool
        var totals: IncomeTotals
    }

    struct Category: Identifiable, Equatable, Sendable {
        var id: String
        var name: String
        /// `#RRGGBB`, or nil for a fallback colour.
        var color: String?
        var isSaving: Bool
        var isProtected: Bool
        var totalCents: Int
        var expenseCount: Int
        var refundCount: Int
        var previousMonthTotalCents: Int
    }

    var month: String
    var sources: [Source]
    var combined: IncomeTotals
    var categories: [Category]
    var totalCents: Int
    var savingCents: Int
    var previousMonthTotalCents: Int
    var leftOverCents: Int
    var unconfirmedExpenseCount: Int
    var unconfirmedIncomeCount: Int
    var applies: [TemplateApply]
    var isEmpty: Bool

    var unconfirmedCount: Int { unconfirmedExpenseCount + unconfirmedIncomeCount }

    /// The Saving categories' spending last month (their `isSaving` flag, never a name).
    var previousSavingCents: Int {
        categories.filter(\.isSaving).reduce(0) { $0 + $1.previousMonthTotalCents }
    }
}

/// Gross, gross taxable and net income, summed (`IncomeTotals`).
struct IncomeTotals: Equatable, Sendable {
    var grossCents: Int
    var grossTaxableCents: Int
    var netCents: Int
    var entryCount: Int

    static let zero = IncomeTotals(grossCents: 0, grossTaxableCents: 0, netCents: 0, entryCount: 0)
}

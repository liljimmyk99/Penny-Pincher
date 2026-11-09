/// A new income entry to save (`IncomeEntryCreate`). Taxable and net must each
/// be at most gross.
struct IncomeEntryDraft: Equatable, Sendable {
    var date: String
    var incomeSourceID: String
    var grossCents: Int
    var grossTaxableCents: Int
    var netCents: Int
    var note: String?
}

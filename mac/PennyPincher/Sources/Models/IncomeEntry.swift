/// One paycheck or one-off job (`IncomeEntry`). The note is shown as its label.
struct IncomeEntry: Identifiable, Equatable, Hashable, Sendable {
    var id: String
    var date: String
    var incomeSourceID: String
    var grossCents: Int
    var grossTaxableCents: Int
    var netCents: Int
    var note: String?
    var confirmed: Bool
    var templateApplyID: String?
}

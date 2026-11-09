/// Entry count (all time) and year totals for one income source (`IncomeSourceStats`).
struct IncomeSourceStats: Equatable, Sendable {
    var incomeSourceID: String
    var entryCount: Int
    var yearGrossCents: Int
    var yearGrossTaxableCents: Int
    var yearNetCents: Int
}

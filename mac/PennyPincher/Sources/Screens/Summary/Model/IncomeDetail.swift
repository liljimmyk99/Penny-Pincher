/// What the income sheet shows: one source's entries for the month, its own
/// total, and the "All sources combined" total.
struct IncomeDetail: Identifiable, Equatable {
    var id: String
    var title: String
    var rows: [IncomeRow]
    var total: IncomeRow
    var combined: IncomeRow
}

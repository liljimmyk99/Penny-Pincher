/// Ready rows in one calendar year, for the review table.
struct ImportYear: Equatable, Identifiable, Sendable {
    var year: Int
    var months: Int
    var expenseRows: Int
    var incomeRows: Int
    var spentCents: Int
    var rowsWithProblems: Int

    var id: Int { year }
}

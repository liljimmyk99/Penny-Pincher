/// How much data a month already has: what a template reset would delete.
struct MonthCounts: Equatable, Sendable {
    var expenses: Int
    var income: Int
}

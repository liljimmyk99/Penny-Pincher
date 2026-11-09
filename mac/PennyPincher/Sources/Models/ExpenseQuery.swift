/// Which expenses to list (`GET /v1/expenses`): a month, or a date range.
struct ExpenseQuery: Equatable, Sendable {
    enum Kind: String, Sendable { case expense, refund }

    var month: String?
    var from: String?
    var to: String?
    var merchantID: String?
    var kind: Kind?
    /// Only the first page, this long (for "latest expense at this merchant").
    /// Nil reads every page.
    var limit: Int?
}

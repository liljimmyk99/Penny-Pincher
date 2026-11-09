/// An expense or refund (`Expense`). Dates are `YYYY-MM-DD`; amounts are cents,
/// and a negative amount is a refund.
struct Expense: Identifiable, Equatable, Hashable, Sendable {
    var id: String
    var date: String
    var amountCents: Int
    var categoryID: String
    var merchant: Merchant
    var note: String?
    /// On a refund, the expense it refunds (optional).
    var refundedExpenseID: String?
    /// On an expense, the sum of its linked refunds (zero or negative), computed by the API.
    var refundedTotalCents: Int
    /// On an expense, the date of its latest linked refund.
    var lastRefundDate: String?
    /// False for template copies the user hasn't reviewed yet.
    var confirmed: Bool
    var templateApplyID: String?

    var isRefund: Bool { amountCents < 0 }

    /// What is left after linked refunds. Display only; never stored.
    var netCents: Int { amountCents + refundedTotalCents }
}

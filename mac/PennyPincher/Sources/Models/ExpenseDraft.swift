/// A new expense or refund to save (`ExpenseCreate`). A new merchant name
/// creates the merchant.
struct ExpenseDraft: Equatable, Sendable {
    var date: String
    var amountCents: Int
    var categoryID: String
    var merchantName: String
    var note: String?
    /// Only on a refund (negative amount).
    var refundedExpenseID: String?
}

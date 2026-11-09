/// The fields of an expense being changed (`ExpenseUpdate`): nil leaves a field
/// as it is. An empty note clears it (the API stores it as null).
struct ExpenseChanges: Equatable, Sendable {
    var date: String?
    var amountCents: Int?
    var categoryID: String?
    var merchantName: String?
    var note: String?
    var refundedExpenseID: String?
    var confirmed: Bool?

    var isEmpty: Bool { self == ExpenseChanges() }
}

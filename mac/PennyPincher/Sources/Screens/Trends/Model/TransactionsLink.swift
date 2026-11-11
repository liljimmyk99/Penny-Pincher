/// Where "Open in Transactions" goes: a month, narrowed to a trend's matches
/// (a category filter, or a search for the merchant or the note text).
struct TransactionsLink: Equatable {
    var month: String
    var categoryID: String?
    var search: String?
}

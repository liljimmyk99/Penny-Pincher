/// An expense or refund as the table shows it. The sortable columns are
/// `date`, `merchant`, `categoryName` and `amountCents`.
struct TransactionRow: Identifiable, Equatable {
    var id: String
    var date: String
    var dateText: String
    var merchant: String
    var categoryName: String
    var isSaving: Bool
    var note: String
    var amountCents: Int
    var amountText: String
    var isRefund: Bool
    var isUnconfirmed: Bool
    /// A refund's tag; nil on an expense, or while a linked original loads.
    var tag: RefundTag?
    /// A linked refund's original: its id and "Merchant · Mar 12 · $50.00".
    var refundForID: String?
    var refundForText: String?
    /// What happened to an expense that refunds point at.
    var originalStatus: OriginalStatus?

    /// An unlinked refund offers "Link…".
    var canLink: Bool { isRefund && tag == .unlinked }
}

/// A matching expense or refund under the selected month's bar.
struct TrendEntryRow: Identifiable, Equatable {
    var id: String
    /// "Oct 3".
    var dateText: String
    var merchant: String
    /// "Food · Weekly shop · Refund".
    var detail: String
    var amountText: String
    var isRefund: Bool
}

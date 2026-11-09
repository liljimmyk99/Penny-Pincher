/// The month's refund tiles. Display only.
struct RefundTotals: Equatable, Sendable {
    /// Sum of the month's refunds (zero or negative).
    var refundCents = 0
    var refundCount = 0
    var linkedCount = 0
    /// Every expense logged in the month, refunds left out.
    var beforeCents = 0

    /// What Summary and Trends show: expenses plus refunds.
    var afterCents: Int { beforeCents + refundCents }
}

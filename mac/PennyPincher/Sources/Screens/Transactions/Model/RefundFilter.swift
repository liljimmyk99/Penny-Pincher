import Foundation

/// The "Refunds" and "Not linked" chips; nil is "All".
enum RefundFilter: String, CaseIterable, Hashable, Sendable {
    case refunds
    case unlinked

    var title: LocalizedStringResource {
        switch self {
        case .refunds: "transactions.filter.refunds"
        case .unlinked: "transactions.filter.unlinked"
        }
    }

    func matches(_ expense: Expense) -> Bool {
        switch self {
        case .refunds: expense.isRefund
        case .unlinked: expense.isRefund && expense.refundedExpenseID == nil
        }
    }
}

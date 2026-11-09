import SwiftUI

/// The amount: refunds in the refund colour, a fully refunded original struck through.
struct AmountCell: View {
    let row: TransactionRow

    var body: some View {
        Text(row.amountText)
            .monospacedDigit()
            .strikethrough(row.originalStatus?.full ?? false)
            .foregroundStyle(row.isRefund ? Color.refund : Color.primary)
            .frame(maxWidth: .infinity, alignment: .trailing)
    }
}

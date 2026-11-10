import SwiftUI

/// A matching entry: date, merchant, category and note, amount. Refunds use
/// the refund colour.
struct TrendEntryRowView: View {
    let row: TrendEntryRow

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(row.dateText)
                .monospacedDigit()
                .foregroundStyle(.secondary)
                .frame(width: 56, alignment: .leading)
            VStack(alignment: .leading, spacing: 1) {
                Text(row.merchant)
                Text(row.detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(row.amountText)
                .monospacedDigit()
                .foregroundStyle(row.isRefund ? Color.refund : Color.primary)
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }
}

import SwiftUI

/// The merchant, and below it a refund's "Refund for …" link or what
/// happened to an original.
struct MerchantCell: View {
    let row: TransactionRow
    let onShowOriginal: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(row.merchant)
            if let text = row.refundForText {
                Button(text) { onShowOriginal(row.id) }
                    .buttonStyle(.link)
                    .font(.caption)
                    .help(Text("transactions.showOriginal"))
            }
            if let status = row.originalStatus {
                Text(status.text)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

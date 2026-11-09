import SwiftUI

/// Unconfirmed (with Confirm), a refund's tag, and Link… for an unlinked refund.
struct StatusCell: View {
    let row: TransactionRow
    let onConfirm: (String) -> Void
    let onLink: (String) -> Void

    var body: some View {
        HStack(spacing: 6) {
            if row.isUnconfirmed {
                UnconfirmedPill()
                Button("transactions.confirm") { onConfirm(row.id) }
                    .controlSize(.small)
                    .accessibilityLabel(Text("transactions.confirm.accessibility \(row.merchant)"))
            }
            if let tag = row.tag {
                Pill(text: Text(tag.text), foreground: .refund, background: .refundBackground)
            }
            if row.canLink {
                Button("transactions.link") { onLink(row.id) }
                    .controlSize(.small)
                    .accessibilityLabel(Text("transactions.link.accessibility \(row.merchant)"))
            }
        }
    }
}

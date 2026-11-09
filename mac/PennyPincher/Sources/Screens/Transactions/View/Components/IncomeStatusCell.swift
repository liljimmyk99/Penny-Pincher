import SwiftUI

struct IncomeStatusCell: View {
    let row: IncomeRow
    let onConfirm: (String) -> Void

    var body: some View {
        if row.isUnconfirmed {
            HStack(spacing: 6) {
                UnconfirmedPill()
                Button("transactions.confirm") { onConfirm(row.id) }
                    .controlSize(.small)
                    .accessibilityLabel(Text("transactions.confirm.accessibility \(row.source)"))
            }
        }
    }
}

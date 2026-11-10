import SwiftUI

/// The selected month's matching entries, with Open in Transactions.
struct TrendMonthEntries: View {
    let title: String
    let phase: LoadPhase
    let rows: [TrendEntryRow]
    let emptyText: String?
    let canOpenTransactions: Bool
    let onOpenTransactions: () -> Void
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                    .font(.headline)
                Spacer()
                Button("trends.entries.open", action: onOpenTransactions)
                    .disabled(!canOpenTransactions)
                Button("common.dismiss", systemImage: "xmark", action: onClose)
                    .labelStyle(.iconOnly)
                    .buttonStyle(.borderless)
            }
            if let message = phase.errorMessage {
                Text(message)
                    .foregroundStyle(.red)
            } else if phase == .loading {
                ProgressView()
                    .controlSize(.small)
            } else if let emptyText {
                Text(emptyText)
                    .foregroundStyle(.secondary)
            } else {
                VStack(spacing: 0) {
                    ForEach(rows) { row in
                        TrendEntryRowView(row: row)
                        Divider()
                    }
                }
            }
        }
        .padding(12)
        .background(.background.secondary, in: .rect(cornerRadius: 8))
    }
}

import SwiftUI

/// Income per source, with an "All sources combined" line. A source opens a
/// sheet with its entries.
struct IncomeSection: View {
    let rows: [IncomeSourceRow]
    let combined: IncomeSourceRow?
    let onOpen: (String) -> Void
    let onAdd: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("summary.income.title")
                .font(.headline)
            if rows.isEmpty {
                EmptyPanel(message: "summary.income.empty", actionTitle: "summary.income.add", action: onAdd)
            } else {
                VStack(spacing: 0) {
                    ForEach(rows) { row in
                        IncomeSourceButton(row: row, onOpen: { onOpen(row.id) })
                        Divider()
                    }
                    if let combined {
                        HStack {
                            Text(combined.name).fontWeight(.semibold)
                            Spacer()
                            Text(combined.netText)
                                .monospacedDigit()
                                .fontWeight(.semibold)
                                .foregroundStyle(Color.income)
                        }
                        .padding(.vertical, 6)
                        .padding(.horizontal, 10)
                        .accessibilityElement(children: .combine)
                    }
                }
                .background(.background.secondary, in: .rect(cornerRadius: 8))
            }
        }
    }
}

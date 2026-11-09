import SwiftUI

/// This month's income entries so far, with their net total.
struct IncomeSoFarList: View {
    let entries: [IncomeEntry]
    let total: String
    let sourceName: (String) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("income.soFar")
                    .font(.headline)
                Spacer()
                Text(total)
                    .monospacedDigit()
                    .foregroundStyle(Color.income)
                    .accessibilityLabel(Text("income.soFar.total \(total)"))
            }
            if entries.isEmpty {
                Text("income.soFar.empty")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(entries) { entry in
                    IncomeSoFarRow(entry: entry, sourceName: sourceName(entry.incomeSourceID))
                }
            }
        }
    }
}

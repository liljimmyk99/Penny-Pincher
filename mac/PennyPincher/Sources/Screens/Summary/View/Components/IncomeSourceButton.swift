import SwiftUI

/// An income source's month total; opens its entries.
struct IncomeSourceButton: View {
    let row: IncomeSourceRow
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack {
                Text(row.name)
                Text("summary.income.entries \(row.entryCount)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(row.netText)
                    .monospacedDigit()
                    .foregroundStyle(Color.income)
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 10)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("summary.income.accessibility \(row.name) \(row.netText) \(row.entryCount)"))
        .accessibilityHint(Text("summary.income.hint"))
    }
}

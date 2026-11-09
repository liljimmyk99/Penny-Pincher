import SwiftUI

/// A paycheck or bill in a template preview: day, name, amount.
struct TemplatePreviewRowView: View {
    let row: TemplatePreviewRow

    var body: some View {
        HStack {
            Text(row.dayText)
                .monospacedDigit()
                .foregroundStyle(.secondary)
                .frame(width: 28, alignment: .trailing)
            Text(row.title)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(row.amountText)
                .monospacedDigit()
                .foregroundStyle(row.isIncome ? Color.income : Color.primary)
        }
        .accessibilityElement(children: .combine)
    }
}

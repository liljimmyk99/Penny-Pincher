import SwiftUI

/// The table's total and monthly-average lines.
struct YearlyFooterRow: View {
    let row: YearlyRow

    var body: some View {
        HStack(spacing: 16) {
            Text(row.title).fontWeight(.semibold)
            Spacer()
            LabeledContent("yearly.column.net", value: row.netText)
                .foregroundStyle(Color.income)
            LabeledContent("yearly.column.spent", value: row.spentText)
            LabeledContent("yearly.column.left", value: row.leftOverText)
        }
        .monospacedDigit()
        .font(.callout)
        .padding(.horizontal, 8)
        .accessibilityElement(children: .combine)
    }
}

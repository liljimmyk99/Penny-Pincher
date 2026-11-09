import SwiftUI

/// The income table's total line.
struct IncomeTotalRow: View {
    let total: IncomeRow

    var body: some View {
        HStack(spacing: 16) {
            Text(total.source).font(.headline)
            Spacer()
            LabeledContent("income.field.gross", value: total.grossText)
            LabeledContent("income.field.taxable", value: total.taxableText)
            LabeledContent("income.field.net", value: total.netText)
                .foregroundStyle(Color.income)
            LabeledContent("categories.column.taxRate", value: total.taxRateText)
        }
        .monospacedDigit()
        .font(.callout)
        .padding(.horizontal, 8)
        .accessibilityElement(children: .combine)
    }
}

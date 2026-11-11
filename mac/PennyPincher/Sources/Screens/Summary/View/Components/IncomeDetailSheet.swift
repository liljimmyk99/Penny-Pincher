import SwiftUI

/// A source's income entries for the month, its total and "All sources combined".
struct IncomeDetailSheet: View {
    let detail: IncomeDetail
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(detail.title)
                .font(.title3.weight(.semibold))
            Table(detail.rows) {
                TableColumn("income.field.date", value: \.dateText)
                TableColumn("income.field.label", value: \.label)
                TableColumn("income.field.gross") { Text($0.grossText).monospacedDigit() }
                TableColumn("income.field.taxable") { Text($0.taxableText).monospacedDigit() }
                TableColumn("income.field.net") { Text($0.netText).monospacedDigit().foregroundStyle(Color.income) }
                TableColumn("categories.column.taxRate") { Text($0.taxRateText).monospacedDigit() }
            }
            .frame(minHeight: 140)
            IncomeTotalRow(total: detail.total)
            IncomeTotalRow(total: detail.combined)
            HStack {
                Spacer()
                Button("common.done", action: onClose)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(minWidth: 640, minHeight: 360)
    }
}

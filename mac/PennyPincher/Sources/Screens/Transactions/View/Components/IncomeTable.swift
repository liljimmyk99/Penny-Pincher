import SwiftUI

/// The month's income: date, source, label, gross, taxable, net and tax rate.
struct IncomeTable: View {
    let rows: [IncomeRow]
    @Binding var selection: Set<String>
    let onEdit: (String) -> Void
    let onConfirm: (String) -> Void
    let onDelete: (String) -> Void
    let onPrimary: (Set<String>) -> Void

    var body: some View {
        Table(rows, selection: $selection) {
            TableColumn("add.column.date") { row in Text(row.dateText).monospacedDigit() }
                .width(min: 56, ideal: 64, max: 80)
            TableColumn("income.field.source") { row in Text(row.source) }
            TableColumn("income.field.label") { row in Text(row.label).foregroundStyle(.secondary) }
            TableColumn("income.field.gross") { row in MoneyCell(text: row.grossText) }
            TableColumn("income.field.taxable") { row in MoneyCell(text: row.taxableText) }
            TableColumn("income.field.net") { row in MoneyCell(text: row.netText) }
            TableColumn("categories.column.taxRate") { row in MoneyCell(text: row.taxRateText) }
            TableColumn("transactions.column.status") { row in
                IncomeStatusCell(row: row, onConfirm: onConfirm)
            }
        }
        .contextMenu(forSelectionType: String.self) { ids in
            IncomeRowMenu(ids: ids, rows: rows, onEdit: onEdit, onConfirm: onConfirm, onDelete: onDelete)
        } primaryAction: { ids in
            onPrimary(ids)
        }
        .accessibilityLabel(Text("transactions.income"))
    }
}

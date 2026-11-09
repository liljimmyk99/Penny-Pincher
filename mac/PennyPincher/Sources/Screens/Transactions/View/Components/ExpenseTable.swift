import SwiftUI

/// The month's expenses and refunds, sortable by date, merchant, category and amount.
struct ExpenseTable: View {
    let rows: [TransactionRow]
    @Binding var selection: Set<String>
    @Binding var sortOrder: [KeyPathComparator<TransactionRow>]
    let onEdit: (String) -> Void
    let onConfirm: (String) -> Void
    let onLink: (String) -> Void
    let onDelete: (String) -> Void
    let onShowOriginal: (String) -> Void
    let onPrimary: (Set<String>) -> Void
    let onDeleteSelection: () -> Void

    var body: some View {
        Table(rows, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("add.column.date", value: \.date) { row in
                Text(row.dateText).monospacedDigit()
            }
            .width(min: 56, ideal: 64, max: 80)
            TableColumn("add.column.merchant", value: \.merchant) { row in
                MerchantCell(row: row, onShowOriginal: onShowOriginal)
            }
            .width(min: 140, ideal: 220)
            TableColumn("add.column.category", value: \.categoryName) { row in
                CategoryCell(name: row.categoryName, isSaving: row.isSaving)
            }
            .width(min: 90, ideal: 120)
            TableColumn("add.column.note", value: \.note) { row in
                Text(row.note).foregroundStyle(.secondary)
            }
            .width(min: 80, ideal: 160)
            TableColumn("add.column.amount", value: \.amountCents) { row in
                AmountCell(row: row)
            }
            .width(min: 80, ideal: 100)
            TableColumn("transactions.column.status") { row in
                StatusCell(row: row, onConfirm: onConfirm, onLink: onLink)
            }
            .width(min: 120, ideal: 210)
        }
        .contextMenu(forSelectionType: String.self) { ids in
            ExpenseRowMenu(ids: ids, rows: rows, onEdit: onEdit, onConfirm: onConfirm, onLink: onLink, onDelete: onDelete)
        } primaryAction: { ids in
            onPrimary(ids)
        }
        .onDeleteCommand(perform: onDeleteSelection)
        .accessibilityLabel(Text("transactions.expenses"))
    }
}

import SwiftUI

/// Column headings over the batch rows.
struct ExpenseBatchHeader: View {
    var body: some View {
        HStack(spacing: 8) {
            Text("add.column.date").frame(width: EntryColumns.date, alignment: .leading)
            Text("add.column.merchant").frame(minWidth: 150, maxWidth: .infinity, alignment: .leading)
            Text("add.column.category").frame(width: EntryColumns.category, alignment: .leading)
            Text("add.column.amount").frame(width: EntryColumns.amount, alignment: .trailing)
            Text("add.column.note").frame(minWidth: 120, maxWidth: .infinity, alignment: .leading)
            Color.clear.frame(width: 20, height: 1)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 6)
        .accessibilityHidden(true)
    }
}

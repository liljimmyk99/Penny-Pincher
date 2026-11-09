import SwiftUI

/// The expense table's context menu for the selected rows.
struct ExpenseRowMenu: View {
    let ids: Set<String>
    let rows: [TransactionRow]
    let onEdit: (String) -> Void
    let onConfirm: (String) -> Void
    let onLink: (String) -> Void
    let onDelete: (String) -> Void

    var body: some View {
        if ids.count == 1, let id = ids.first, let row = rows.first(where: { $0.id == id }) {
            Button("transactions.menu.edit") { onEdit(id) }
            if row.isUnconfirmed {
                Button("transactions.confirm") { onConfirm(id) }
            }
            if row.canLink {
                Button("transactions.link") { onLink(id) }
            }
            Divider()
            Button("transactions.menu.delete", role: .destructive) { onDelete(id) }
        }
    }
}

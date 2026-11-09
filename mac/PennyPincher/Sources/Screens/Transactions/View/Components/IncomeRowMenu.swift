import SwiftUI

/// The income table's context menu.
struct IncomeRowMenu: View {
    let ids: Set<String>
    let rows: [IncomeRow]
    let onEdit: (String) -> Void
    let onConfirm: (String) -> Void
    let onDelete: (String) -> Void

    var body: some View {
        if ids.count == 1, let id = ids.first, let row = rows.first(where: { $0.id == id }) {
            Button("transactions.menu.edit") { onEdit(id) }
            if row.isUnconfirmed {
                Button("transactions.confirm") { onConfirm(id) }
            }
            Divider()
            Button("transactions.menu.delete", role: .destructive) { onDelete(id) }
        }
    }
}

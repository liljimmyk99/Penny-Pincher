import SwiftUI

/// The row's context menu and accessibility actions: rename, move, delete.
struct ManagedRowMenu: View {
    let row: ManagedRow
    let onRename: (String) -> Void
    let onDelete: (String) -> Void
    let onMoveUp: (String) -> Void
    let onMoveDown: (String) -> Void

    var body: some View {
        if !row.isLocked {
            Button("categories.menu.rename") { onRename(row.id) }
            Button("categories.menu.moveUp") { onMoveUp(row.id) }
                .disabled(!row.canMoveUp)
            Button("categories.menu.moveDown") { onMoveDown(row.id) }
                .disabled(!row.canMoveDown)
            Divider()
            Button("categories.menu.delete", role: .destructive) { onDelete(row.id) }
                .disabled(!row.canDelete)
        }
    }
}

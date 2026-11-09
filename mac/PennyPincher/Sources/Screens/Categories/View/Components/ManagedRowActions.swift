import SwiftUI

/// Rename and Delete for an unlocked row.
struct ManagedRowActions: View {
    let row: ManagedRow
    let onRename: (String) -> Void
    let onDelete: (String) -> Void

    var body: some View {
        HStack(spacing: 4) {
            if !row.isLocked {
                Button(String(localized: "categories.action.rename \(row.name)"), systemImage: "pencil") {
                    onRename(row.id)
                }
                .help(Text("categories.action.renameHelp"))
                Button(String(localized: "categories.action.delete \(row.name)"), systemImage: "trash") {
                    onDelete(row.id)
                }
                .disabled(!row.canDelete)
                .help(row.deleteHelp.map { Text($0) } ?? Text("categories.action.deleteHelp"))
            }
        }
        .labelStyle(.iconOnly)
        .buttonStyle(.borderless)
        .frame(width: ManageColumns.actions, alignment: .trailing)
    }
}

import SwiftUI

/// One category or income source: name (or the rename field), badges, the
/// section's columns and its actions. "Other" shows a lock and no actions.
struct ManagedRowView: View {
    let row: ManagedRow
    let isRenaming: Bool
    @Binding var renameText: String
    let renameError: String?
    var renameFocused: FocusState<Bool>.Binding
    let onRename: (String) -> Void
    let onDelete: (String) -> Void
    let onMoveUp: (String) -> Void
    let onMoveDown: (String) -> Void
    let onCommitRename: () -> Void
    let onCancelRename: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: row.isLocked ? "lock.fill" : "line.3.horizontal")
                .foregroundStyle(.tertiary)
                .frame(width: 16)
                .accessibilityHidden(true)
            if isRenaming {
                RenameField(text: $renameText, error: renameError, focused: renameFocused,
                            onCommit: onCommitRename, onCancel: onCancelRename)
            } else {
                Text(row.name)
                    .lineLimit(1)
            }
            ForEach(row.badges, id: \.self) { badge in
                RowBadgeView(badge: badge)
            }
            Spacer(minLength: 8)
            ForEach(Array(row.columns.enumerated()), id: \.offset) { column in
                Text(column.element)
                    .monospacedDigit()
                    .frame(width: ManageColumns.width, alignment: .trailing)
            }
            ManagedRowActions(row: row, onRename: onRename, onDelete: onDelete)
        }
        .padding(.vertical, 2)
        .contextMenu {
            ManagedRowMenu(row: row, onRename: onRename, onDelete: onDelete, onMoveUp: onMoveUp, onMoveDown: onMoveDown)
        }
        .accessibilityElement(children: .contain)
        .accessibilityActions {
            ManagedRowMenu(row: row, onRename: onRename, onDelete: onDelete, onMoveUp: onMoveUp, onMoveDown: onMoveDown)
        }
    }
}

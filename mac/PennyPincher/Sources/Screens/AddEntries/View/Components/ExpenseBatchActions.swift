import SwiftUI

/// Add row, Add refund and Save all (⌘Return).
struct ExpenseBatchActions: View {
    let isSaving: Bool
    let canEdit: Bool
    let onAddRow: () -> Void
    let onAddRefund: () -> Void
    let onSave: () -> Void

    var body: some View {
        HStack {
            Button("add.addRow", systemImage: "plus", action: onAddRow)
            Button("add.addRefund", systemImage: "arrow.uturn.backward", action: onAddRefund)
            Spacer()
            if isSaving {
                ProgressView().controlSize(.small)
            }
            Text("add.save.hint")
                .font(.caption)
                .foregroundStyle(.secondary)
            Button("add.save", action: onSave)
                .keyboardShortcut(.return, modifiers: .command)
                .buttonStyle(.borderedProminent)
                .disabled(isSaving || !canEdit)
        }
        .disabled(!canEdit)
    }
}

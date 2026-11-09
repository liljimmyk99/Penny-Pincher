import SwiftUI

/// Cancel (Escape) and the sheet's default action (Return).
struct SheetButtons: View {
    let isSaving: Bool
    let canSave: Bool
    let saveTitle: LocalizedStringKey
    let onSave: () -> Void
    let onCancel: () -> Void

    var body: some View {
        HStack {
            Spacer()
            if isSaving {
                ProgressView().controlSize(.small)
            }
            Button("common.cancel", action: onCancel)
                .keyboardShortcut(.cancelAction)
            Button(saveTitle, action: onSave)
                .keyboardShortcut(.defaultAction)
                .disabled(isSaving || !canSave)
        }
    }
}

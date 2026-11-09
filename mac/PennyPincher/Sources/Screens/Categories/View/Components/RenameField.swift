import SwiftUI

/// The inline rename field: Return saves, Escape cancels.
struct RenameField: View {
    @Binding var text: String
    let error: String?
    var focused: FocusState<Bool>.Binding
    let onCommit: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            TextField("categories.rename.label", text: $text)
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 260)
                .focused(focused)
                .onSubmit(onCommit)
                .onExitCommand(perform: onCancel)
            if let error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }
}

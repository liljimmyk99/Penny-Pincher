import SwiftUI

/// The chosen template's name with Apply, Rename and Delete beside it.
struct TemplateHeader: View {
    let title: String
    let detail: String?
    let canApply: Bool
    let isDisabled: Bool
    let onApply: () -> Void
    let onRename: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.title2.weight(.semibold))
                if let detail {
                    Text(detail).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button("templates.apply", systemImage: "doc.on.doc", action: onApply)
                .disabled(isDisabled || !canApply)
            Button("templates.rename", systemImage: "pencil", action: onRename)
                .disabled(isDisabled)
            Button("templates.delete", systemImage: "trash", role: .destructive, action: onDelete)
                .disabled(isDisabled)
        }
        .labelStyle(.titleAndIcon)
    }
}

import SwiftUI

/// One category's bills (Saving has its own badge and tint) with its total.
struct TemplateCategorySection: View {
    let group: TemplateCategoryGroup
    let isDisabled: Bool
    let onAdd: (String) -> Void
    let onEdit: (String) -> Void
    let onRemove: (String) -> Void

    var body: some View {
        Section {
            ForEach(group.rows) { row in
                TemplateExpenseRowView(row: row, onEdit: onEdit, onRemove: onRemove)
            }
            Button("templates.expense.add", systemImage: "plus") { onAdd(group.id) }
                .buttonStyle(.borderless)
                .disabled(isDisabled)
        } header: {
            HStack {
                Text(group.name)
                if group.isSaving {
                    Pill(text: Text("categories.badge.saving"), foreground: .saving, background: .saving.opacity(0.12))
                }
                Spacer()
                Text(group.totalText).monospacedDigit()
            }
            .foregroundStyle(group.isSaving ? Color.saving : Color.primary)
        }
    }
}

import SwiftUI

/// A bill: day, "<merchant> · <note>", amount, with edit and remove.
struct TemplateExpenseRowView: View {
    let row: TemplateExpenseRow
    let onEdit: (String) -> Void
    let onRemove: (String) -> Void

    var body: some View {
        HStack {
            Text(row.dayText).monospacedDigit().foregroundStyle(.secondary).frame(width: 28, alignment: .trailing)
            Text(row.title).frame(maxWidth: .infinity, alignment: .leading)
            MoneyCell(text: row.amountText)
            Button("templates.edit", systemImage: "pencil") { onEdit(row.id) }
                .labelStyle(.iconOnly)
                .buttonStyle(.borderless)
            Button("templates.remove", systemImage: "minus.circle") { onRemove(row.id) }
                .labelStyle(.iconOnly)
                .buttonStyle(.borderless)
        }
        .accessibilityElement(children: .contain)
    }
}

import SwiftUI

/// A paycheck: day, source, label, gross, taxable, net and tax rate, with edit and remove.
struct TemplateIncomeRowView: View {
    let row: TemplateIncomeRow
    let isTotal: Bool
    let onEdit: (String) -> Void
    let onRemove: (String) -> Void

    var body: some View {
        HStack {
            Text(row.dayText).monospacedDigit().foregroundStyle(.secondary).frame(width: 28, alignment: .trailing)
            Text(row.source).frame(maxWidth: .infinity, alignment: .leading)
            Text(row.label).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
            MoneyCell(text: row.grossText)
            MoneyCell(text: row.taxableText)
            MoneyCell(text: row.netText)
            MoneyCell(text: row.taxRateText)
            if isTotal {
                Spacer().frame(width: 60)
            } else {
                Button("templates.edit", systemImage: "pencil") { onEdit(row.id) }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.borderless)
                Button("templates.remove", systemImage: "minus.circle") { onRemove(row.id) }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.borderless)
            }
        }
        .fontWeight(isTotal ? .semibold : .regular)
        .accessibilityElement(children: .contain)
    }
}

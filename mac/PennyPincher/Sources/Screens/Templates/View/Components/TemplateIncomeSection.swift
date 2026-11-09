import SwiftUI

/// The template's paychecks, an "All sources" line, and Add income.
struct TemplateIncomeSection: View {
    let rows: [TemplateIncomeRow]
    let total: TemplateIncomeRow?
    let isDisabled: Bool
    let onAdd: () -> Void
    let onEdit: (String) -> Void
    let onRemove: (String) -> Void

    var body: some View {
        Section {
            ForEach(rows) { row in
                TemplateIncomeRowView(row: row, isTotal: false, onEdit: onEdit, onRemove: onRemove)
            }
            if let total {
                TemplateIncomeRowView(row: total, isTotal: true, onEdit: onEdit, onRemove: onRemove)
            }
            Button("templates.income.add", systemImage: "plus", action: onAdd)
                .disabled(isDisabled)
        } header: {
            Text("templates.income.header")
        }
    }
}

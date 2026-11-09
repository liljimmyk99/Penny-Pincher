import SwiftUI

/// A template in "Your templates": its name and item count.
struct TemplateListRow: View {
    let template: TemplateSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(template.name)
            Text("templates.itemCount \(template.expenseItemCount) \(template.incomeItemCount)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

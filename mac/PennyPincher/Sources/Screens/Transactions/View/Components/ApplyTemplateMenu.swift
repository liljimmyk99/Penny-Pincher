import SwiftUI

/// Toolbar "Apply template…": pick a template to copy into the shown month.
struct ApplyTemplateMenu: View {
    let templates: [TemplateSummary]
    let isDisabled: Bool
    let onApply: (String) -> Void

    var body: some View {
        Menu("transactions.applyTemplate", systemImage: "doc.on.doc") {
            ForEach(templates) { template in
                Button(template.name) { onApply(template.id) }
                    .disabled(template.itemCount == 0)
            }
        }
        .disabled(isDisabled || templates.isEmpty)
    }
}

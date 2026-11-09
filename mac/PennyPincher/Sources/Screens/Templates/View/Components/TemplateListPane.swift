import SwiftUI

/// "Your templates" with a New template field under it.
struct TemplateListPane: View {
    let rows: [TemplateSummary]
    @Binding var selection: String?
    @Binding var newName: String
    let newNameError: String?
    let isDisabled: Bool
    let onCreate: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("templates.list.title")
                .font(.headline)
                .padding(.horizontal, 12)
                .padding(.top, 12)
            List(rows, selection: $selection) { template in
                TemplateListRow(template: template)
                    .tag(template.id)
            }
            .overlay {
                if rows.isEmpty {
                    Text("templates.list.empty")
                        .foregroundStyle(.secondary)
                        .padding()
                }
            }
            AddItemField(placeholder: "templates.new.placeholder", buttonTitle: "templates.new.button",
                         text: $newName, error: newNameError, isDisabled: isDisabled, onAdd: onCreate)
                .padding(.leading, 0)
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
        }
        .frame(minWidth: 220, idealWidth: 260, maxWidth: 320)
    }
}

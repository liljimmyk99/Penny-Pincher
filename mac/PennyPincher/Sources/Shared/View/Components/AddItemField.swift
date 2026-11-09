import SwiftUI

/// "Add category" / "Add source" under each list.
struct AddItemField: View {
    let placeholder: LocalizedStringKey
    let buttonTitle: LocalizedStringKey
    @Binding var text: String
    let error: String?
    let isDisabled: Bool
    let onAdd: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                TextField(placeholder, text: $text)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 280)
                    .onSubmit(onAdd)
                Button(buttonTitle, action: onAdd)
                    .disabled(isDisabled)
            }
            if let error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .padding(.leading, 26)
        .padding(.vertical, 4)
    }
}

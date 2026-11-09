import SwiftUI

/// The merchant field, with suggestions from past merchants as you type.
struct MerchantField: View {
    let rowID: UUID
    let number: Int
    @Binding var text: String
    let suggestions: [Merchant]
    let invalid: Bool
    var focus: FocusState<EntryFocus?>.Binding
    let onSubmit: (UUID) -> Void

    var body: some View {
        TextField("add.column.merchant", text: $text, prompt: Text("add.merchant.prompt"))
            .textFieldStyle(.roundedBorder)
            .textInputSuggestions {
                ForEach(suggestions) { merchant in
                    Text(merchant.name)
                        .textInputCompletion(merchant.name)
                }
            }
            .accessibilityLabel(Text("add.field.merchant \(number)"))
            .focused(focus, equals: .merchant(rowID))
            .onSubmit { onSubmit(rowID) }
            .overlay {
                if invalid {
                    RoundedRectangle(cornerRadius: 5).stroke(.red, lineWidth: 1)
                }
            }
    }
}

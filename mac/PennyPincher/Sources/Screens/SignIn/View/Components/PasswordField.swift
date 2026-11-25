import SwiftUI

/// A password with a Show/Hide control. Used by sign-in and Change password.
struct PasswordField<Field: Hashable>: View {
    let title: LocalizedStringKey
    @Binding var password: String
    let invalid: Bool
    let contentType: NSTextContentType
    var focus: FocusState<Field?>.Binding
    let field: Field
    let onSubmit: () -> Void
    @State private var isShown = false

    var body: some View {
        LabeledField(title: title, invalid: invalid) {
            HStack(spacing: 6) {
                ZStack {
                    if isShown {
                        TextField(title, text: $password)
                    } else {
                        SecureField(title, text: $password)
                    }
                }
                .textContentType(contentType)
                .focused(focus, equals: field)
                .onSubmit(onSubmit)
                Button(isShown ? "password.hide" : "password.show") { isShown.toggle() }
                    .buttonStyle(.link)
                    .font(.callout)
            }
        }
    }
}

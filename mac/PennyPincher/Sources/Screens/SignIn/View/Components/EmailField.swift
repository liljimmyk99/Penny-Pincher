import SwiftUI

struct EmailField: View {
    @Binding var email: String
    let invalid: Bool
    var focus: FocusState<SignInField?>.Binding
    let onSubmit: () -> Void

    var body: some View {
        LabeledField(title: "signIn.email", invalid: invalid) {
            // A String (not a key) so SwiftUI doesn't turn the example address into a link.
            TextField(String(localized: "signIn.email.placeholder"), text: $email)
                .textContentType(.username)
                .focused(focus, equals: .email)
                .onSubmit(onSubmit)
        }
    }
}

import SwiftUI

struct UsernameField: View {
    @Binding var username: String
    var focus: FocusState<SignInField?>.Binding
    let onSubmit: () -> Void

    var body: some View {
        LabeledField(title: "signIn.username", invalid: false) {
            TextField("signIn.username", text: $username)
                .textContentType(.username)
                .autocorrectionDisabled()
                .focused(focus, equals: .username)
                .onSubmit(onSubmit)
        }
    }
}

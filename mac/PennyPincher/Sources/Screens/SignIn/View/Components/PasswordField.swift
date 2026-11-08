import SwiftUI

struct PasswordField: View {
    @Binding var password: String
    let invalid: Bool
    var focus: FocusState<SignInField?>.Binding
    let onSubmit: () -> Void

    var body: some View {
        LabeledField(title: "signIn.password", invalid: invalid) {
            SecureField("signIn.password.placeholder", text: $password)
                .textContentType(.password)
                .focused(focus, equals: .password)
                .onSubmit(onSubmit)
        }
    }
}

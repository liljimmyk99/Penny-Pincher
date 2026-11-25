import SwiftUI

/// Username and password.
struct SignInForm: View {
    @Bindable var viewModel: SignInViewModel
    var focus: FocusState<SignInField?>.Binding
    let onUsernameSubmit: () -> Void
    let onSignIn: () -> Void

    var body: some View {
        SignInHeading(title: "signIn.title", detail: "signIn.detail")

        if let notice = viewModel.noticeMessage {
            ErrorBanner(message: notice)
        }
        if let message = viewModel.errorMessage {
            ErrorBanner(message: message)
        }

        VStack(alignment: .leading, spacing: 10) {
            UsernameField(username: $viewModel.username, focus: focus, onSubmit: onUsernameSubmit)
            PasswordField(title: "signIn.password", password: $viewModel.password,
                          invalid: viewModel.isPasswordInvalid, contentType: .password,
                          focus: focus, field: SignInField.password, onSubmit: onSignIn)
        }

        ActionButton(
            title: viewModel.signInButtonTitle,
            isBusy: viewModel.isSigningIn,
            isEnabled: viewModel.canSubmit,
            action: onSignIn
        )

        Text("signIn.askAdmin")
            .font(.callout)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

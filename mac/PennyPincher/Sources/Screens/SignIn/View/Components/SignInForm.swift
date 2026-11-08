import SwiftUI

/// Google, or email and password.
struct SignInForm: View {
    @Bindable var viewModel: SignInViewModel
    var focus: FocusState<SignInField?>.Binding
    let onGoogle: () -> Void
    let onEmailSubmit: () -> Void
    let onSignIn: () -> Void
    let onForgotPassword: () -> Void

    var body: some View {
        SignInHeading(title: "signIn.title", detail: "signIn.detail")

        if let notice = viewModel.noticeMessage {
            ErrorBanner(message: notice)
        }
        if let message = viewModel.errorMessage {
            ErrorBanner(message: message)
        }

        if viewModel.supportsGoogle {
            GoogleSignInButton(title: viewModel.googleButtonTitle, action: onGoogle)
            EmailDivider()
        }

        VStack(alignment: .leading, spacing: 10) {
            EmailField(email: $viewModel.email, invalid: viewModel.isEmailInvalid, focus: focus, onSubmit: onEmailSubmit)
            PasswordField(password: $viewModel.password, invalid: viewModel.isPasswordInvalid, focus: focus, onSubmit: onSignIn)
            Button("signIn.forgot", action: onForgotPassword)
                .buttonStyle(.link)
                .font(.callout)
        }

        ActionButton(
            title: viewModel.signInButtonTitle,
            isBusy: viewModel.isSigningIn,
            isEnabled: viewModel.canSubmit,
            action: onSignIn
        )

        Text("signIn.newHere")
            .font(.callout)
            .foregroundStyle(.secondary)
    }
}

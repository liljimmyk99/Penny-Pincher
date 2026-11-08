import SwiftUI

/// "Forgot password?": send a reset link.
struct ResetForm: View {
    @Bindable var viewModel: SignInViewModel
    var focus: FocusState<SignInField?>.Binding
    let onBack: () -> Void
    let onSend: () -> Void

    var body: some View {
        BackButton(action: onBack)
        SignInHeading(title: "signIn.reset.title", detail: "signIn.reset.detail")

        if let message = viewModel.errorMessage {
            ErrorBanner(message: message)
        }

        EmailField(email: $viewModel.email, invalid: viewModel.isEmailInvalid, focus: focus, onSubmit: onSend)

        ActionButton(
            title: viewModel.resetButtonTitle,
            isBusy: viewModel.isSendingReset,
            isEnabled: viewModel.canSubmit,
            action: onSend
        )
    }
}

import SwiftUI

/// Shown in the main window until someone is signed in.
struct SignInView: View {
    @Bindable var viewModel: SignInViewModel
    @FocusState var focus: SignInField?

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 24)
            SignInCard {
                BrandMark()
                switch viewModel.mode {
                case .signIn:
                    SignInForm(
                        viewModel: viewModel,
                        focus: $focus,
                        onGoogle: continueWithGoogle,
                        onEmailSubmit: emailSubmitted,
                        onSignIn: signIn,
                        onForgotPassword: forgotPassword
                    )
                case .reset:
                    ResetForm(viewModel: viewModel, focus: $focus, onBack: backToSignIn, onSend: sendReset)
                case .sent:
                    ResetSentView(onBack: backToSignIn)
                }
            }
            Spacer(minLength: 24)
            SignInFooter()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .disabled(viewModel.isWorking)
        .onAppear(perform: focusInitialField)
        .onChange(of: viewModel.mode, focusInitialField)
    }
}

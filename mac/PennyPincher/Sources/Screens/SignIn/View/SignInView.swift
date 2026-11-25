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
                SignInForm(viewModel: viewModel, focus: $focus,
                           onUsernameSubmit: usernameSubmitted, onSignIn: signIn)
            }
            Spacer(minLength: 24)
            SignInFooter()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .disabled(viewModel.isSigningIn)
        .onAppear(perform: focusInitialField)
    }
}

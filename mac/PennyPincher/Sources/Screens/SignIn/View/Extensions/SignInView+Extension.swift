extension SignInView {
    func continueWithGoogle() {
        Task { await viewModel.signInWithGoogle() }
    }

    func signIn() {
        Task { await viewModel.signInWithEmail() }
    }

    func sendReset() {
        Task { await viewModel.sendReset() }
    }

    func emailSubmitted() {
        if let next = viewModel.fieldAfterEmail {
            focus = next
        } else {
            sendReset()
        }
    }

    func forgotPassword() {
        viewModel.go(.reset)
    }

    func backToSignIn() {
        viewModel.go(.signIn)
    }

    func focusInitialField() {
        focus = viewModel.initialFocus
    }
}

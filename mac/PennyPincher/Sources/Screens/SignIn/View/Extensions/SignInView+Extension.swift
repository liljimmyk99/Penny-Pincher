extension SignInView {
    func signIn() {
        Task { await viewModel.signIn() }
    }

    func usernameSubmitted() {
        focus = viewModel.fieldAfterUsername
    }

    func focusInitialField() {
        focus = .username
    }
}

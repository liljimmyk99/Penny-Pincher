extension ChangePasswordView {
    func submit() {
        Task { await viewModel.submit() }
    }

    func secondary() {
        viewModel.secondary()
    }
}

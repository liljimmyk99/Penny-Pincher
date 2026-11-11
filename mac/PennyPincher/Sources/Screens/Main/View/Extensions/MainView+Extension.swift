extension MainView {
    func importTransactions() {
        viewModel.importTransactions()
    }

    func openExport() {
        viewModel.openExport()
    }

    func export() {
        Task { await viewModel.export() }
    }

    func closeExport() {
        viewModel.showsExport = false
    }

    func openAdminDashboard() {
        viewModel.openAdminDashboard()
    }

    func signOut() {
        viewModel.signOut()
    }
}

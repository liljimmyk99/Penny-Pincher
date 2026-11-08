import Foundation

extension RootView {
    func appeared() {
        viewModel.appeared()
    }

    func retry() {
        viewModel.retryAccount()
    }

    func signOut() {
        viewModel.signOut()
    }

    func open(_ url: URL) {
        viewModel.open(url)
    }
}

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
}

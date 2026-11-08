import SwiftUI

/// The main window's content for each session phase.
struct RootView: View {
    let viewModel: RootViewModel

    var body: some View {
        Group {
            switch viewModel.content {
            case .setupProblem(let message):
                SetupProblemView(message: message)
            case .restoring:
                ProgressStatusView(message: "root.restoring")
            case .loadingAccount:
                ProgressStatusView(message: "root.loadingAccount")
            case .signedOut(let signIn):
                SignInView(viewModel: signIn)
            case .accountUnavailable(let message):
                AccountUnavailableView(message: message, onSignOut: signOut, onRetry: retry)
            case .signedIn(let main):
                MainView(viewModel: main)
            }
        }
        .frame(minWidth: 720, minHeight: 480)
        .onAppear(perform: appeared)
        .onOpenURL(perform: open)
    }
}

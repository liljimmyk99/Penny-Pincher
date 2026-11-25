import SwiftUI

/// Signed in with a saved session, but loading the account (`/v1/me`) failed for a reason other than the session.
struct AccountUnavailableView: View {
    let message: String
    let onSignOut: () -> Void
    let onRetry: () -> Void

    var body: some View {
        StatusView {
            Text(message)
                .multilineTextAlignment(.center)
            HStack {
                Button("root.signOut", action: onSignOut)
                Button("root.tryAgain", action: onRetry)
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
            }
        }
    }
}

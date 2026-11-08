import SwiftUI

/// Signed in to Firebase, but the API couldn't be reached.
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

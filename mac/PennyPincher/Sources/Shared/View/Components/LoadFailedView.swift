import SwiftUI

/// A screen whose data couldn't load. Online-only: nothing can be added or
/// edited until it does.
struct LoadFailedView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("common.loadFailed", systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            Button("common.retry", action: onRetry)
                .keyboardShortcut(.defaultAction)
        }
    }
}

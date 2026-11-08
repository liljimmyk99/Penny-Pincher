import SwiftUI

/// A spinner with a short message, while the session restores or loads.
struct ProgressStatusView: View {
    let message: LocalizedStringKey

    var body: some View {
        StatusView {
            ProgressView()
                .controlSize(.small)
            Text(message)
                .foregroundStyle(.secondary)
        }
    }
}

import SwiftUI

/// One part of Trends couldn't load, with Try again.
struct TrendLoadFailed: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
                .accessibilityHidden(true)
            Text(message)
            Spacer()
            Button("common.retry", action: onRetry)
        }
        .padding(10)
        .background(.red.opacity(0.08), in: .rect(cornerRadius: 8))
    }
}

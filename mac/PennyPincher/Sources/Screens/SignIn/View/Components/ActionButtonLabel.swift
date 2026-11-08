import SwiftUI

struct ActionButtonLabel: View {
    let title: LocalizedStringResource
    let isBusy: Bool

    var body: some View {
        HStack(spacing: 6) {
            if isBusy {
                ProgressView()
                    .controlSize(.small)
            }
            Text(title)
        }
        .frame(maxWidth: .infinity)
    }
}

import SwiftUI

/// A brief inline message: an error (red) or a confirmation (green), with a
/// dismiss button.
struct NoticeBanner: View {
    let message: String
    let isError: Bool
    let onDismiss: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: isError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                .foregroundStyle(isError ? Color.red : Color.income)
                .accessibilityHidden(true)
            Text(message)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("common.dismiss", systemImage: "xmark", action: onDismiss)
                .labelStyle(.iconOnly)
                .buttonStyle(.borderless)
        }
        .padding(10)
        .background((isError ? Color.red : Color.income).opacity(0.1), in: .rect(cornerRadius: 8))
        .accessibilityElement(children: .contain)
    }
}

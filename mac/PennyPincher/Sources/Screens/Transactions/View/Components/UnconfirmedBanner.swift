import SwiftUI

/// Template copies still need a look: the count and "Confirm all as-is".
struct UnconfirmedBanner: View {
    let text: String
    let isWorking: Bool
    let onConfirmAll: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "circle.fill")
                .font(.caption2)
                .foregroundStyle(Color.brand)
                .accessibilityHidden(true)
            Text(text)
                .foregroundStyle(Color.unconfirmed)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("transactions.confirmAll", action: onConfirmAll)
                .disabled(isWorking)
        }
        .padding(10)
        .background(Color.unconfirmedBackground, in: .rect(cornerRadius: 8))
        .accessibilityElement(children: .contain)
    }
}

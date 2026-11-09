import SwiftUI

/// Template copies still need a look: the count, Review, Undo (right after
/// copying) and "Confirm all as-is".
struct UnconfirmedBanner: View {
    let text: String
    let isWorking: Bool
    let isReviewing: Bool
    let canUndo: Bool
    let onReview: () -> Void
    let onUndo: () -> Void
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
            Button(isReviewing ? "transactions.showAll" : "transactions.review", action: onReview)
            if canUndo {
                Button("transactions.undo", action: onUndo)
                    .disabled(isWorking)
            }
            Button("transactions.confirmAll", action: onConfirmAll)
                .disabled(isWorking)
        }
        .padding(10)
        .background(Color.unconfirmedBackground, in: .rect(cornerRadius: 8))
        .accessibilityElement(children: .contain)
    }
}

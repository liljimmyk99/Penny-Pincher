import SwiftUI

/// The text beside a ranked bar: amount, share of income and the change.
struct RankedBarAnnotation: View {
    let item: RankedBarItem

    var body: some View {
        HStack(spacing: 6) {
            Text(item.amountText)
                .monospacedDigit()
            if let detail = item.detailText {
                Text(detail)
                    .foregroundStyle(.secondary)
            }
            if let change = item.change {
                ChangeLabel(change: change)
            }
        }
        .font(.caption)
        .fixedSize()
    }
}

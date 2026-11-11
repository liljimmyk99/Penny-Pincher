import SwiftUI

/// A donut legend row: colour, name, amount, share and change. Choosing it
/// only highlights its slice.
struct CategoryLegendRow: View {
    let item: RankedBarItem
    let isHighlighted: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 8) {
                Circle()
                    .fill(item.color)
                    .frame(width: 10, height: 10)
                    .accessibilityHidden(true)
                Text(item.name)
                    .fontWeight(isHighlighted ? .semibold : .regular)
                if item.isSaving {
                    Pill(text: Text("summary.category.saving"), foreground: .saving, background: Color.saving.opacity(0.15))
                }
                Spacer()
                RankedBarAnnotation(item: item)
            }
            .padding(.vertical, 4)
            .padding(.horizontal, 8)
            .background(isHighlighted ? Color.brandPrimary.opacity(0.12) : .clear, in: .rect(cornerRadius: 6))
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.accessibilityLabel)
        .accessibilityAddTraits(isHighlighted ? .isSelected : [])
    }
}

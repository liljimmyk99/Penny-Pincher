import SwiftUI

/// A category with entries this month: name, count, total and share, with a
/// small bar. Clicking filters the list to it.
struct CategoryChipButton: View {
    let chip: CategoryChip
    let onToggle: (String) -> Void

    var body: some View {
        Button {
            onToggle(chip.id)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(chip.name).lineLimit(1)
                    Text(String(chip.count)).foregroundStyle(.secondary)
                }
                HStack(spacing: 6) {
                    Text(chip.totalText).monospacedDigit()
                    Text(chip.shareText).foregroundStyle(.secondary).monospacedDigit()
                }
                .font(.caption)
                CategoryBar(fraction: chip.barFraction, isSaving: chip.isSaving)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .frame(minWidth: 110, alignment: .leading)
            .background(chip.isSelected ? Color.brandPrimary.opacity(0.15) : Color.secondary.opacity(0.08),
                        in: .rect(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(chip.isSelected ? Color.brandPrimary : .clear, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("transactions.chip.accessibility \(chip.name) \(chip.count) \(chip.totalText) \(chip.shareText)"))
        .accessibilityAddTraits(chip.isSelected ? .isSelected : [])
    }
}

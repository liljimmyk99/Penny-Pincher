import SwiftUI

/// One of Summary's four figures, with its change from last month.
struct SummaryTileView: View {
    let tile: SummaryTile

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(tile.title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(tile.valueText)
                .font(.title3.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(tile.tint)
            if let detail = tile.detail {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let change = tile.change {
                HStack(spacing: 4) {
                    ChangeLabel(change: change)
                    Text("summary.tile.vsLast")
                        .foregroundStyle(.secondary)
                }
                .font(.caption)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: .rect(cornerRadius: 8))
        .accessibilityElement(children: .combine)
    }
}

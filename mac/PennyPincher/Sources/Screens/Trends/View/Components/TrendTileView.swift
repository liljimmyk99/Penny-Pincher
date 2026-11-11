import SwiftUI

/// One figure, with a change indicator or a caption under it.
struct TrendTileView: View {
    let tile: TrendTile

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(tile.title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(tile.valueText)
                .font(.title3.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(tile.tint)
            if let caption = tile.caption {
                Text(caption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let change = tile.change {
                TrendChangeLabel(change: change)
                    .font(.caption)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: .rect(cornerRadius: 8))
        .accessibilityElement(children: .combine)
    }
}

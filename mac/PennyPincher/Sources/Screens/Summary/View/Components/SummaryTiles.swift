import SwiftUI

/// Net income, spent, saved & invested, left over.
struct SummaryTiles: View {
    let tiles: [SummaryTile]

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ForEach(tiles) { tile in
                SummaryTileView(tile: tile)
            }
        }
    }
}

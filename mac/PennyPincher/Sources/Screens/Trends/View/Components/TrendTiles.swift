import SwiftUI

/// A row of Trends figures.
struct TrendTiles: View {
    let tiles: [TrendTile]

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ForEach(tiles) { tile in
                TrendTileView(tile: tile)
            }
        }
    }
}

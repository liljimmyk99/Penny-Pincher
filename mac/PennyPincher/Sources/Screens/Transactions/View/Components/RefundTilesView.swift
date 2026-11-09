import SwiftUI

/// Refunds this month, spent before refunds and spent after refunds.
struct RefundTilesView: View {
    let tiles: RefundTiles

    var body: some View {
        HStack(spacing: 12) {
            FigureTile(title: "transactions.tile.refunds", value: tiles.refundsText, detail: tiles.refundsDetail,
                       tint: .refund)
            FigureTile(title: "transactions.tile.before", value: tiles.beforeText, detail: nil, tint: .primary)
            FigureTile(title: "transactions.tile.after", value: tiles.afterText, detail: nil, tint: .spent)
        }
    }
}

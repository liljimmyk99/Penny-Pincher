import SwiftUI

/// Planned net income, planned spending (Saving included, the saved part
/// noted) and left over, summed from the template's items.
struct TemplateTilesView: View {
    let totals: TemplateTotals

    var body: some View {
        HStack(spacing: 12) {
            FigureTile(title: "templates.tile.net", value: Money.format(totals.netIncomeCents), detail: nil,
                       tint: .income)
            FigureTile(title: "templates.tile.spending", value: Money.format(totals.spendingCents),
                       detail: totals.savedCents > 0
                           ? String(localized: "templates.tile.savedDetail \(Money.format(totals.savedCents))") : nil,
                       tint: .spent)
            FigureTile(title: "templates.tile.leftOver", value: Money.format(totals.leftOverCents), detail: nil,
                       tint: .primary)
        }
    }
}

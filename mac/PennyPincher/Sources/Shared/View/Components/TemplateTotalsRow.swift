import SwiftUI

/// A template's planned net income, spending and left over.
struct TemplateTotalsRow: View {
    let totals: TemplateTotals

    var body: some View {
        HStack(spacing: 20) {
            Text("month.offer.net \(Money.format(totals.netIncomeCents))")
            Text("month.offer.spending \(Money.format(totals.spendingCents))")
            Text("month.offer.leftOver \(Money.format(totals.leftOverCents))")
        }
        .font(.callout.weight(.medium))
        .monospacedDigit()
    }
}

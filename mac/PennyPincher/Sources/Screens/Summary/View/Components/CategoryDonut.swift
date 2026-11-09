import Charts
import SwiftUI

/// Category share as a donut, with the month's total in the middle.
struct CategoryDonut: View {
    let items: [RankedBarItem]
    let highlightedID: String?
    let totalText: String

    var body: some View {
        Chart(items) { item in
            SectorMark(angle: .value("chart.amount", item.valueCents), innerRadius: .ratio(0.62), angularInset: 1.5)
                .foregroundStyle(item.color)
                .opacity(highlightedID == nil || highlightedID == item.id ? 1 : 0.3)
                .accessibilityLabel(item.accessibilityLabel)
        }
        .chartLegend(.hidden)
        .chartBackground { _ in
            VStack(spacing: 2) {
                Text("summary.tile.spent")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(totalText)
                    .font(.headline)
                    .monospacedDigit()
            }
        }
        .frame(width: 220, height: 220)
    }
}

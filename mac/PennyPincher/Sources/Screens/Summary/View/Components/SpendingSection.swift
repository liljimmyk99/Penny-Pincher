import SwiftUI

/// Spending by category: ranked bars or a donut, a Bars/Donut control.
/// Selecting a category only highlights it.
struct SpendingSection: View {
    @Binding var mode: ChartMode
    let items: [RankedBarItem]
    let highlightedID: String?
    let totalText: String
    let onHighlight: (String) -> Void
    let onAdd: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("summary.spending.title")
                    .font(.headline)
                Spacer()
                Picker("summary.chart.mode", selection: $mode) {
                    ForEach(ChartMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(width: 160)
                .disabled(items.isEmpty)
            }
            if items.isEmpty {
                EmptyPanel(message: "summary.spending.empty", actionTitle: "summary.spending.add", action: onAdd)
            } else if mode == .bars {
                RankedBarsChart(items: items, highlightedID: highlightedID, onSelect: onHighlight)
            } else {
                HStack(alignment: .center, spacing: 24) {
                    CategoryDonut(items: items, highlightedID: highlightedID, totalText: totalText)
                    VStack(spacing: 2) {
                        ForEach(items) { item in
                            CategoryLegendRow(item: item, isHighlighted: highlightedID == item.id,
                                              onSelect: { onHighlight(item.id) })
                        }
                    }
                }
            }
        }
    }
}

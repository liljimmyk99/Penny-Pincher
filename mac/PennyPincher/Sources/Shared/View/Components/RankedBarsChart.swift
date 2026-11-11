import Charts
import SwiftUI

/// Ranked horizontal bars (Swift Charts), largest first, each labelled with its
/// amount, share and change. Selecting a bar only highlights it.
struct RankedBarsChart: View {
    let items: [RankedBarItem]
    let highlightedID: String?
    let onSelect: (String) -> Void

    private var largest: Int { items.map(\.valueCents).max() ?? 0 }

    var body: some View {
        Chart(items) { item in
            BarMark(x: .value("chart.amount", item.valueCents), y: .value("chart.category", item.id))
                .foregroundStyle(item.color)
                .opacity(highlightedID == nil || highlightedID == item.id ? 1 : 0.3)
                .annotation(position: .trailing, alignment: .leading) {
                    RankedBarAnnotation(item: item)
                }
                .accessibilityLabel(item.accessibilityLabel)
                .accessibilityValue(item.amountText)
        }
        .chartYScale(domain: items.map(\.id))
        .chartXScale(domain: 0...max(largest * 2, 1))
        .chartXAxis(.hidden)
        .chartYAxis {
            AxisMarks { value in
                AxisValueLabel {
                    if let id = value.as(String.self), let item = items.first(where: { $0.id == id }) {
                        Text(item.name)
                            .fontWeight(highlightedID == id ? .semibold : .regular)
                    }
                }
            }
        }
        .chartOverlay { proxy in
            GeometryReader { geometry in
                Rectangle()
                    .fill(.clear)
                    .contentShape(.rect)
                    .onTapGesture { location in
                        select(at: location, proxy: proxy, geometry: geometry)
                    }
            }
        }
        .frame(height: CGFloat(items.count) * 34 + 16)
    }
}

import Charts
import SwiftUI

/// A custom trend as vertical bars per month (Swift Charts). Choosing a bar
/// lists that month's entries; the chosen bar stays highlighted.
struct TrendBarsChart: View {
    let items: [TrendBarItem]
    let selectedID: String?
    let title: String
    let onSelect: (String) -> Void

    var body: some View {
        Chart(items) { item in
            BarMark(x: .value("chart.month", item.id), y: .value("chart.amount", item.value))
                .foregroundStyle(Color.brand)
                .opacity(selectedID == nil || selectedID == item.id ? 1 : 0.35)
                .accessibilityLabel(item.accessibilityLabel)
        }
        .chartXScale(domain: items.map(\.id))
        .chartXAxis {
            AxisMarks { value in
                AxisValueLabel {
                    if let id = value.as(String.self), let item = items.first(where: { $0.id == id }) {
                        Text(item.label)
                            .fontWeight(selectedID == id ? .semibold : .regular)
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
        .accessibilityLabel(Text(title))
        .frame(height: 220)
    }
}

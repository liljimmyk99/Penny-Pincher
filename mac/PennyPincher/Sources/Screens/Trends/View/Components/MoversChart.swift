import Charts
import SwiftUI

/// Biggest movers as diverging horizontal bars around a zero line: an increase
/// goes right, a decrease left, coloured by meaning (orange worse, blue
/// better; Saving flips), with the arrow and amount beside it. Choosing a
/// category charts it; choosing it again goes back to all spending.
struct MoversChart: View {
    let items: [MoverItem]
    let selectedID: String?
    let emptyText: String
    let onSelect: (String) -> Void

    private var largest: Int { items.map { Int($0.deltaCents.magnitude) }.max() ?? 0 }

    var body: some View {
        if items.isEmpty {
            Text(emptyText)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, minHeight: 120)
        } else {
            Chart {
                RuleMark(x: .value("chart.amount", 0))
                    .foregroundStyle(.secondary)
                ForEach(items) { item in
                    BarMark(xStart: .value("chart.amount", 0), xEnd: .value("chart.amount", item.deltaCents),
                            y: .value("chart.category", item.id))
                        .foregroundStyle(item.tone.color)
                        .opacity(selectedID == nil || selectedID == item.id ? 1 : 0.4)
                        .annotation(position: item.deltaCents > 0 ? .trailing : .leading,
                                    alignment: item.deltaCents > 0 ? .leading : .trailing) {
                            Text(item.changeText)
                                .font(.caption)
                                .monospacedDigit()
                                .foregroundStyle(item.tone.color)
                                .fixedSize()
                        }
                        .accessibilityLabel(item.accessibilityLabel)
                }
            }
            .chartXScale(domain: -max(largest * 2, 1)...max(largest * 2, 1))
            .chartYScale(domain: items.map(\.id))
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks(position: .leading) { value in
                    AxisValueLabel {
                        if let id = value.as(String.self), let item = items.first(where: { $0.id == id }) {
                            Text(item.name)
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
            .accessibilityLabel(Text("trends.movers.title"))
            .frame(height: CGFloat(items.count) * 30 + 16)
        }
    }
}

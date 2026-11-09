import Charts
import SwiftUI

/// Net income vs. spent per month as paired vertical bars. Choosing a month's
/// pair opens that month.
struct PairedBarsChart: View {
    let items: [PairedBarItem]
    let onSelect: (String) -> Void

    private let incomeName = String(localized: "yearly.series.income")
    private let spentName = String(localized: "yearly.series.spent")

    var body: some View {
        Chart {
            ForEach(items) { item in
                BarMark(x: .value("chart.month", item.label), y: .value("chart.amount", item.netCents))
                    .position(by: .value("chart.series", incomeName))
                    .foregroundStyle(by: .value("chart.series", incomeName))
                    .accessibilityLabel(item.accessibilityLabel)
                BarMark(x: .value("chart.month", item.label), y: .value("chart.amount", item.spentCents))
                    .position(by: .value("chart.series", spentName))
                    .foregroundStyle(by: .value("chart.series", spentName))
                    .accessibilityHidden(true)
            }
        }
        .chartForegroundStyleScale([incomeName: Color.income, spentName: Color.spent])
        .chartXScale(domain: items.map(\.label))
        .chartYAxis {
            AxisMarks { value in
                AxisGridLine()
                AxisValueLabel {
                    if let cents = value.as(Int.self) {
                        Text(Money.format(cents, hideSymbol: false))
                            .monospacedDigit()
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
        .frame(height: 240)
    }
}

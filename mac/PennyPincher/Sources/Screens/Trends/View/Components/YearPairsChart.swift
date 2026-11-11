import Charts
import SwiftUI

/// This year vs. last year per month as paired vertical bars; last year is
/// the quieter bar. Choosing a month selects it for the figures and movers.
struct YearPairsChart: View {
    let items: [YearPairItem]
    let selectedID: String?
    let thisYearName: String
    let lastYearName: String
    let isSaving: Bool
    let title: String
    let onSelect: (String) -> Void

    var body: some View {
        Chart {
            ForEach(items) { item in
                BarMark(x: .value("chart.month", item.id), y: .value("chart.amount", item.thisYearCents))
                    .position(by: .value("chart.series", thisYearName))
                    .foregroundStyle(by: .value("chart.series", thisYearName))
                    .opacity(selectedID == nil || selectedID == item.id ? 1 : 0.45)
                    .accessibilityLabel(item.accessibilityLabel)
                BarMark(x: .value("chart.month", item.id), y: .value("chart.amount", item.lastYearCents))
                    .position(by: .value("chart.series", lastYearName))
                    .foregroundStyle(by: .value("chart.series", lastYearName))
                    .opacity(selectedID == nil || selectedID == item.id ? 1 : 0.45)
                    .accessibilityHidden(true)
            }
        }
        .chartForegroundStyleScale([thisYearName: isSaving ? Color.saving : Color.spent,
                                    lastYearName: Color.secondary.opacity(0.45)])
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
        .chartYAxis {
            AxisMarks { value in
                AxisGridLine()
                AxisValueLabel {
                    if let cents = value.as(Int.self) {
                        Text(Money.format(cents))
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
        .accessibilityLabel(Text(title))
        .frame(height: 240)
    }
}

import Charts
import SwiftUI

/// Small bars, one per month, for the saved-trends list. Decorative: the row
/// reads the values out.
struct TrendSparkline: View {
    let values: [Int]

    var body: some View {
        Chart(Array(values.enumerated()), id: \.offset) { item in
            BarMark(x: .value("chart.month", String(item.offset)), y: .value("chart.amount", item.element))
                .foregroundStyle(Color.brand)
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartLegend(.hidden)
        .frame(width: 72, height: 24)
        .accessibilityHidden(true)
    }
}

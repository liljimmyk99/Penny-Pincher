import Foundation

/// Spending by category as ranked bars (default) or a donut.
enum ChartMode: String, CaseIterable, Identifiable {
    case bars
    case donut

    var id: String { rawValue }

    var title: LocalizedStringResource {
        switch self {
        case .bars: "summary.chart.bars"
        case .donut: "summary.chart.donut"
        }
    }
}

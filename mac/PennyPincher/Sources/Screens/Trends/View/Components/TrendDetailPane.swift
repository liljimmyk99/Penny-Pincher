import SwiftUI

/// The selected trend: its definition, the Amount/Count toggle, figures, bars
/// per month and the selected month's entries.
struct TrendDetailPane: View {
    @Bindable var viewModel: CustomTrendsViewModel
    let onRetry: () -> Void
    let onSelectMonth: (String) -> Void
    let onClearMonth: () -> Void
    let onOpenTransactions: () -> Void

    var body: some View {
        if let trend = viewModel.selectedTrend {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(trend.name)
                            .font(.title2.weight(.semibold))
                        Spacer()
                        Picker("trends.measure", selection: $viewModel.measure) {
                            ForEach(TrendMeasure.allCases) { measure in
                                Text(measure.title).tag(measure)
                            }
                        }
                        .pickerStyle(.segmented)
                        .labelsHidden()
                        .frame(width: 180)
                    }
                    TrendPills(pills: viewModel.pills)
                    if let message = viewModel.detailPhase.errorMessage {
                        TrendLoadFailed(message: message, onRetry: onRetry)
                    } else if viewModel.detailPhase == .loading {
                        ProgressView("common.loading")
                            .frame(maxWidth: .infinity)
                    } else {
                        TrendTiles(tiles: viewModel.tiles)
                        Text(viewModel.chartTitle)
                            .font(.headline)
                        TrendBarsChart(items: viewModel.bars, selectedID: viewModel.selectedMonth,
                                       title: viewModel.chartTitle, onSelect: onSelectMonth)
                        Text("trends.chart.hint")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let title = viewModel.entriesTitle {
                            TrendMonthEntries(title: title, phase: viewModel.entriesPhase, rows: viewModel.entryRows,
                                              emptyText: viewModel.entriesEmptyText,
                                              canOpenTransactions: viewModel.transactionsLink != nil,
                                              onOpenTransactions: onOpenTransactions, onClose: onClearMonth)
                        }
                    }
                }
                .padding(16)
            }
        } else {
            ContentUnavailableView(String(localized: "trends.selectTrend"), systemImage: "chart.bar")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

import SwiftUI

/// Yearly: year-to-date figures with averages, income vs. spent per month,
/// category monthly averages and the month-by-month table.
struct YearlyView: View {
    @Bindable var viewModel: YearlyViewModel

    var body: some View {
        Group {
            if let message = viewModel.phase.errorMessage {
                LoadFailedView(message: message, onRetry: retry)
            } else if viewModel.phase == .loading {
                ProgressView("common.loading")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack(alignment: .top, spacing: 12) {
                            ForEach(viewModel.tiles) { tile in
                                FigureTile(title: tile.title, value: tile.value, detail: tile.detail, tint: tile.tint)
                            }
                        }
                        if viewModel.hasData {
                            Text("yearly.chart.incomeVsSpent")
                                .font(.headline)
                            PairedBarsChart(items: viewModel.pairedBars, onSelect: openMonth)
                            Text("yearly.chart.averages")
                                .font(.headline)
                            RankedBarsChart(items: viewModel.averageItems, highlightedID: nil, onSelect: ignore)
                        } else {
                            ContentUnavailableView(String(localized: "yearly.empty"), systemImage: "calendar")
                                .frame(maxWidth: .infinity)
                        }
                        Text("yearly.table.title")
                            .font(.headline)
                        YearlyTable(rows: viewModel.rows, selection: $viewModel.selectedMonth)
                        if let total = viewModel.totalRow, let average = viewModel.averageRow {
                            YearlyFooterRow(row: total)
                            YearlyFooterRow(row: average)
                        }
                    }
                    .padding(16)
                }
            }
        }
        .navigationTitle(Text("sidebar.yearly"))
        .toolbar {
            ToolbarItem(placement: .navigation) {
                YearSwitcher(title: viewModel.yearTitle, previousTitle: viewModel.previousYearTitle,
                             nextTitle: viewModel.nextYearTitle, onPrevious: previousYear, onNext: nextYear)
            }
        }
        .task(load)
        .onChange(of: viewModel.year, yearChanged)
        .onChange(of: viewModel.selectedMonth, tableSelectionChanged)
    }
}

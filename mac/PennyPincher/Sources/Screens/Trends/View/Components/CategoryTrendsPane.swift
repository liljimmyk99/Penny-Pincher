import SwiftUI

/// By category: a category picker, the selected month's figures, this year vs.
/// last year per month, biggest movers and the month-by-month change table.
struct CategoryTrendsPane: View {
    @Bindable var viewModel: CategoryTrendsViewModel
    let onRetry: () -> Void
    let onPreviousYear: () -> Void
    let onNextYear: () -> Void
    let onYearChanged: () -> Void
    let onSelectMonth: (String) -> Void
    let onToggleCategory: (String) -> Void

    var body: some View {
        Group {
            if let message = viewModel.phase.errorMessage {
                LoadFailedView(message: message, onRetry: onRetry)
            } else if viewModel.phase == .loading {
                ProgressView("common.loading")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Picker("trends.category.picker", selection: $viewModel.selectedCategoryID) {
                            ForEach(viewModel.options) { option in
                                TrendCategoryOptionLabel(option: option)
                                    .tag(option.categoryID)
                            }
                        }
                        .frame(maxWidth: 320)
                        TrendTiles(tiles: viewModel.tiles)
                        HStack(alignment: .top, spacing: 16) {
                            TrendSection(title: viewModel.pairsTitle, description: viewModel.pairsDescription) {
                                YearPairsChart(items: viewModel.pairs, selectedID: viewModel.selectedRowID,
                                               thisYearName: viewModel.thisYearName,
                                               lastYearName: viewModel.lastYearName,
                                               isSaving: viewModel.series?.isSaving ?? false,
                                               title: viewModel.pairsTitle, onSelect: onSelectMonth)
                            }
                            TrendSection(title: String(localized: "trends.movers.title"),
                                         description: viewModel.moversDescription) {
                                MoversChart(items: viewModel.movers, selectedID: viewModel.selectedCategoryID,
                                            emptyText: viewModel.moversEmptyText, onSelect: onToggleCategory)
                            }
                        }
                        TrendSection(title: String(localized: "trends.table.title"),
                                     description: viewModel.tableDescription) {
                            CategoryTrendTable(rows: viewModel.rows, selection: $viewModel.selectedRowID,
                                               lastYearTitle: viewModel.lastYearColumnTitle,
                                               lastYearChangeTitle: viewModel.lastYearChangeColumnTitle)
                        }
                    }
                    .padding(16)
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigation) {
                YearSwitcher(title: viewModel.yearTitle, previousTitle: viewModel.previousYearTitle,
                             nextTitle: viewModel.nextYearTitle, canGoPrevious: viewModel.canGoToPreviousYear,
                             canGoNext: viewModel.canGoToNextYear, onPrevious: onPreviousYear, onNext: onNextYear)
            }
        }
        .onChange(of: viewModel.year, onYearChanged)
    }
}

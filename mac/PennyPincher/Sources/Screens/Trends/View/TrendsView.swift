import SwiftUI

/// Trends: a segmented control switches Custom trends and By category.
struct TrendsView: View {
    @Bindable var viewModel: TrendsViewModel

    var body: some View {
        VStack(spacing: 0) {
            Picker("trends.mode", selection: $viewModel.mode) {
                ForEach(TrendsMode.allCases) { mode in
                    Text(mode.title).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: 300)
            .padding(.vertical, 10)
            Divider()
            switch viewModel.mode {
            case .custom:
                CustomTrendsPane(viewModel: viewModel.custom, onRetry: load, onRetryTrend: retryTrend,
                                 onSelectMonth: selectMonth, onClearMonth: clearMonth,
                                 onOpenTransactions: openInTransactions, onNewTrend: newTrend,
                                 onSaveNewTrend: saveNewTrend, onCancelNewTrend: cancelNewTrend)
            case .byCategory:
                CategoryTrendsPane(viewModel: viewModel.byCategory, onRetry: load, onPreviousYear: previousYear,
                                   onNextYear: nextYear, onYearChanged: yearChanged, onSelectMonth: selectYearMonth,
                                   onToggleCategory: toggleCategory)
            }
        }
        .navigationTitle(Text("sidebar.trends"))
        .task(loadOnAppear)
        .onChange(of: viewModel.mode, load)
    }
}

import SwiftUI

/// Custom trends: the saved trends on the left and the selected one on the right.
struct CustomTrendsPane: View {
    @Bindable var viewModel: CustomTrendsViewModel
    let onRetry: () -> Void
    let onRetryTrend: () -> Void
    let onSelectMonth: (String) -> Void
    let onClearMonth: () -> Void
    let onOpenTransactions: () -> Void
    let onNewTrend: () -> Void
    let onSaveNewTrend: () -> Void
    let onCancelNewTrend: () -> Void

    var body: some View {
        Group {
            if let message = viewModel.phase.errorMessage {
                LoadFailedView(message: message, onRetry: onRetry)
            } else if viewModel.phase == .loading {
                ProgressView("common.loading")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.isEmpty {
                TrendsEmptyView(onNewTrend: onNewTrend)
            } else {
                HStack(spacing: 0) {
                    SavedTrendList(rows: viewModel.rows, selection: $viewModel.selectedID)
                        .frame(width: 280)
                    Divider()
                    TrendDetailPane(viewModel: viewModel, onRetry: onRetryTrend, onSelectMonth: onSelectMonth,
                                    onClearMonth: onClearMonth, onOpenTransactions: onOpenTransactions)
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("trends.new", systemImage: "plus", action: onNewTrend)
                    .help(Text("trends.new.help"))
                    .disabled(!viewModel.canCreate)
            }
        }
        .sheet(item: $viewModel.newTrend) { editor in
            NewTrendSheet(viewModel: editor, onSave: onSaveNewTrend, onCancel: onCancelNewTrend)
        }
    }
}

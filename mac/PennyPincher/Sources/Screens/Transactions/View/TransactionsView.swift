import SwiftUI

/// Transactions: income table, refund tiles, category filters and the
/// sortable expense table, with edit, delete, confirm and Link… sheets.
struct TransactionsView: View {
    @Bindable var viewModel: TransactionsViewModel

    var body: some View {
        Group {
            if let message = viewModel.phase.errorMessage {
                LoadFailedView(message: message, onRetry: retry)
            } else if viewModel.phase == .loading {
                ProgressView("common.loading")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    if let message = viewModel.errorMessage ?? viewModel.statusMessage {
                        NoticeBanner(message: message, isError: viewModel.errorMessage != nil, onDismiss: dismissMessages)
                    }
                    if viewModel.unconfirmedCount > 0 {
                        UnconfirmedBanner(text: viewModel.unconfirmedText, isWorking: viewModel.isWorking,
                                          onConfirmAll: confirmAll)
                    }
                    if !viewModel.incomeEntries.isEmpty {
                        IncomeTable(rows: viewModel.incomeRows, selection: $viewModel.incomeSelection,
                                    onEdit: editIncome, onConfirm: confirmIncome, onDelete: deleteIncome,
                                    onPrimary: editIncomeSelection)
                            .frame(height: incomeTableHeight)
                        IncomeTotalRow(total: viewModel.incomeTotal)
                    }
                    RefundTilesView(tiles: viewModel.refundTiles)
                    TransactionFilters(chips: viewModel.categoryChips, isAllSelected: viewModel.categoryFilter == nil,
                                       refundFilter: $viewModel.refundFilter, onAll: showAllCategories,
                                       onToggle: toggleCategory)
                    ExpenseTable(rows: viewModel.rows, selection: $viewModel.selection, sortOrder: $viewModel.sortOrder,
                                 onEdit: editExpense, onConfirm: confirmExpense, onLink: linkRefund,
                                 onDelete: deleteExpense, onShowOriginal: showOriginal,
                                 onPrimary: editExpenseSelection, onDeleteSelection: deleteSelection)
                        .overlay {
                            if viewModel.rows.isEmpty {
                                ContentUnavailableView(String(localized: viewModel.emptyMessage),
                                                       systemImage: "list.bullet")
                            }
                        }
                }
                .padding(16)
            }
        }
        .navigationTitle(Text("sidebar.transactions"))
        .searchable(text: $viewModel.search, prompt: Text("transactions.search"))
        .toolbar {
            ToolbarItem(placement: .navigation) {
                MonthSwitcher(month: viewModel.month, onPrevious: previousMonth, onNext: nextMonth)
            }
        }
        .task(load)
        .onChange(of: viewModel.month.month, monthChanged)
        .sheet(item: $viewModel.expenseEditor) { editor in
            ExpenseEditorView(viewModel: editor, onSave: saveExpenseEditor, onCancel: closeSheets)
        }
        .sheet(item: $viewModel.incomeEditor) { editor in
            IncomeEditorView(viewModel: editor, onSave: saveIncomeEditor, onCancel: closeSheets)
        }
        .sheet(item: $viewModel.linker) { linker in
            LinkRefundView(viewModel: linker, onLink: linkSelected, onCancel: closeSheets)
                .task(loadLinker)
        }
        .confirmationDialog(
            viewModel.pendingDelete?.title ?? "",
            isPresented: deleteDialogPresented,
            titleVisibility: .visible,
            presenting: viewModel.pendingDelete
        ) { _ in
            Button("transactions.menu.deleteConfirm", role: .destructive, action: confirmDelete)
            Button("common.cancel", role: .cancel, action: cancelDelete)
        } message: { request in
            Text(request.message)
        }
    }
}

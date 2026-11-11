import SwiftUI

/// Summary: the month's figures, income per source, spending by category,
/// the unconfirmed banner, the new-month offer and the welcome checklist.
struct SummaryView: View {
    @Bindable var viewModel: SummaryViewModel

    var body: some View {
        Group {
            if let message = viewModel.phase.errorMessage {
                LoadFailedView(message: message, onRetry: retry)
            } else if viewModel.phase == .loading {
                ProgressView("common.loading")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.showsNewMonthOffer {
                VStack(spacing: 12) {
                    if let message = viewModel.noticeMessage {
                        NoticeBanner(message: message, isError: viewModel.noticeIsError, onDismiss: dismissMessages)
                    }
                    NewMonthOffer(viewModel: viewModel.templates, onSelect: selectTemplate, onCopy: copyTemplate,
                                  onStartBlank: startBlank)
                }
                .padding(16)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if let message = viewModel.noticeMessage {
                            NoticeBanner(message: message, isError: viewModel.noticeIsError, onDismiss: dismissMessages)
                        }
                        if viewModel.unconfirmedCount > 0 {
                            UnconfirmedBanner(text: viewModel.bannerText,
                                              isWorking: viewModel.isWorking || viewModel.templates.isWorking,
                                              isReviewing: false,
                                              canUndo: viewModel.templates.undoableApply != nil,
                                              onReview: review, onUndo: undoApply, onConfirmAll: confirmAll)
                        }
                        if viewModel.showsWelcome {
                            WelcomeChecklist(steps: viewModel.welcomeSteps, progressText: viewModel.welcomeProgressText,
                                             onOpen: openWelcomeStep, onHide: hideWelcome)
                        }
                        SummaryTiles(tiles: viewModel.tiles)
                        IncomeSection(rows: viewModel.incomeRows, combined: viewModel.combinedRow,
                                      onOpen: openIncome, onAdd: addIncome)
                        SpendingSection(mode: $viewModel.chartMode, items: viewModel.rankedItems,
                                        highlightedID: viewModel.highlightedCategoryID,
                                        totalText: viewModel.spendingTotalText, onHighlight: highlight, onAdd: addExpenses)
                        if viewModel.isEmpty {
                            Text("summary.empty.note")
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(16)
                }
            }
        }
        .navigationTitle(Text("sidebar.summary"))
        .toolbar {
            ToolbarItem(placement: .navigation) {
                MonthSwitcher(month: viewModel.month, onPrevious: previousMonth, onNext: nextMonth)
            }
        }
        .task(load)
        .onChange(of: viewModel.month.month, monthChanged)
        .sheet(item: $viewModel.incomeDetail) { detail in
            IncomeDetailSheet(detail: detail, onClose: closeIncome)
        }
        .confirmationDialog(
            viewModel.templates.pendingReset?.title ?? "",
            isPresented: resetDialogPresented,
            titleVisibility: .visible,
            presenting: viewModel.templates.pendingReset
        ) { _ in
            Button("month.reset.confirm", role: .destructive, action: confirmReset)
            Button("common.cancel", role: .cancel, action: cancelReset)
        } message: { request in
            Text(request.message)
        }
    }
}

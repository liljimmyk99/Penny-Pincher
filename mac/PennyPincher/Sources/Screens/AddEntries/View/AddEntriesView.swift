import SwiftUI

/// Add entries: the expense batch (refunds included) and the income form.
struct AddEntriesView: View {
    @Bindable var viewModel: AddEntriesViewModel
    @FocusState var focus: EntryFocus?

    var body: some View {
        Group {
            if let message = viewModel.phase.errorMessage {
                LoadFailedView(message: message, onRetry: retry)
            } else if viewModel.phase == .loading {
                ProgressView("common.loading")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        if let message = viewModel.statusMessage {
                            NoticeBanner(message: message, isError: false, onDismiss: dismissStatus)
                        }
                        GroupBox {
                            VStack(alignment: .leading, spacing: 6) {
                                ExpenseBatchHeader()
                                ForEach(Array($viewModel.rows.enumerated()), id: \.element.id) { item in
                                    ExpenseRowEditor(
                                        row: item.element,
                                        number: item.offset + 1,
                                        categories: viewModel.categories,
                                        suggestions: viewModel.suggestions[item.element.wrappedValue.id] ?? [],
                                        refundCandidates: viewModel.refundCandidates[item.element.wrappedValue.id],
                                        errors: viewModel.errors(for: item.element.wrappedValue.id),
                                        canRemove: viewModel.canRemoveRows,
                                        category: categoryBinding(item.element.wrappedValue.id),
                                        refundLink: refundLinkBinding(item.element.wrappedValue.id),
                                        focus: $focus,
                                        onSubmit: rowSubmitted,
                                        onRemove: removeRow,
                                        onMerchantChange: merchantChanged,
                                        onNeedRefundCandidates: loadRefundCandidates
                                    )
                                }
                                FieldError(message: viewModel.batchError)
                                ExpenseBatchActions(isSaving: viewModel.isSavingExpenses, canEdit: viewModel.canEdit,
                                                    onAddRow: addRow, onAddRefund: addRefund, onSave: saveExpenses)
                            }
                            .padding(6)
                        } label: {
                            Text("add.section.expenses").font(.headline)
                        }
                        GroupBox {
                            HStack(alignment: .top, spacing: 24) {
                                VStack(alignment: .leading, spacing: 6) {
                                    IncomeFormView(form: $viewModel.income, sources: viewModel.sources,
                                                   errors: viewModel.incomeErrors, isSaving: viewModel.isSavingIncome,
                                                   canEdit: viewModel.canEdit, focus: $focus, onSave: saveIncome)
                                    FieldError(message: viewModel.incomeError)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                IncomeSoFarList(entries: viewModel.incomeEntries, total: viewModel.incomeTotalText,
                                                sourceName: viewModel.sourceName)
                                    .frame(width: 280)
                            }
                            .padding(6)
                        } label: {
                            Text("add.section.income").font(.headline)
                        }
                    }
                    .padding(20)
                    .frame(maxWidth: 1100, alignment: .leading)
                }
            }
        }
        .navigationTitle(Text("sidebar.addEntries"))
        .toolbar {
            ToolbarItem(placement: .navigation) {
                MonthSwitcher(month: viewModel.month, onPrevious: previousMonth, onNext: nextMonth)
            }
        }
        .task(load)
        .onChange(of: viewModel.month.month, monthChanged)
        .onChange(of: viewModel.focusRequest, focusFirstBlankRow)
    }
}

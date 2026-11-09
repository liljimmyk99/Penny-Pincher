import SwiftUI

/// Templates: the list on the left, the chosen template's editor on the right.
struct TemplatesView: View {
    @Bindable var viewModel: TemplatesViewModel

    var body: some View {
        Group {
            if let message = viewModel.phase.errorMessage {
                LoadFailedView(message: message, onRetry: retry)
            } else if viewModel.phase == .loading {
                ProgressView("common.loading")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                HSplitView {
                    TemplateListPane(rows: viewModel.listRows, selection: $viewModel.selection,
                                     newName: $viewModel.newName, newNameError: viewModel.newNameError,
                                     isDisabled: viewModel.isWorking, onCreate: createTemplate)
                    VStack(alignment: .leading, spacing: 12) {
                        if let message = viewModel.noticeMessage {
                            NoticeBanner(message: message, isError: viewModel.noticeIsError, onDismiss: dismissMessages)
                        }
                        if viewModel.selected != nil {
                            TemplateHeader(title: viewModel.title, detail: viewModel.itemCountText,
                                           canApply: viewModel.canApply, isDisabled: viewModel.isWorking,
                                           onApply: beginApply, onRename: beginRename, onDelete: deleteTemplate)
                            if let totals = viewModel.totals {
                                TemplateTilesView(totals: totals)
                            }
                            List {
                                TemplateIncomeSection(rows: viewModel.incomeRows, total: viewModel.incomeTotal,
                                                      isDisabled: viewModel.isWorking, onAdd: addIncome,
                                                      onEdit: editIncome, onRemove: removeIncome)
                                ForEach(viewModel.categoryGroups) { group in
                                    TemplateCategorySection(group: group, isDisabled: viewModel.isWorking,
                                                            onAdd: addExpense, onEdit: editExpense,
                                                            onRemove: removeExpense)
                                }
                            }
                            .listStyle(.inset(alternatesRowBackgrounds: true))
                        } else {
                            ContentUnavailableView("templates.empty.title", systemImage: "doc.on.doc",
                                                   description: Text("templates.empty.detail"))
                        }
                    }
                    .padding(16)
                    .frame(minWidth: 480, maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
        .navigationTitle(Text("sidebar.templates"))
        .task(load)
        .onChange(of: viewModel.selection, selectionChanged)
        .sheet(item: $viewModel.expenseEditor) { editor in
            TemplateExpenseItemEditorView(viewModel: editor, onSave: saveExpenseEditor, onCancel: closeSheets)
        }
        .sheet(item: $viewModel.incomeEditor) { editor in
            TemplateIncomeItemEditorView(viewModel: editor, onSave: saveIncomeEditor, onCancel: closeSheets)
        }
        .sheet(isPresented: $viewModel.showsApplySheet) {
            ApplyTemplateSheet(title: viewModel.applyTitle, month: viewModel.applyMonth,
                               errorMessage: viewModel.applier.errorMessage, isWorking: viewModel.applier.isWorking,
                               onPrevious: previousApplyMonth, onNext: nextApplyMonth, onApply: apply,
                               onCancel: closeSheets)
                .confirmationDialog(
                    viewModel.applier.pendingReset?.title ?? "",
                    isPresented: resetDialogPresented,
                    titleVisibility: .visible,
                    presenting: viewModel.applier.pendingReset
                ) { _ in
                    Button("month.reset.confirm", role: .destructive, action: confirmApplyReset)
                    Button("common.cancel", role: .cancel, action: cancelApplyReset)
                } message: { request in
                    Text(request.message)
                }
        }
        .alert("templates.rename.title", isPresented: $viewModel.isRenaming) {
            TextField("templates.rename.placeholder", text: $viewModel.renameText)
            Button("common.save", action: commitRename)
            Button("common.cancel", role: .cancel, action: {})
        } message: {
            Text(viewModel.renameError ?? "")
        }
        .confirmationDialog(
            viewModel.pendingDelete?.title ?? "",
            isPresented: deleteDialogPresented,
            titleVisibility: .visible,
            presenting: viewModel.pendingDelete
        ) { request in
            Button(request.confirmTitle, role: .destructive, action: confirmDelete)
            Button("common.cancel", role: .cancel, action: cancelDelete)
        } message: { request in
            Text(request.message)
        }
    }
}

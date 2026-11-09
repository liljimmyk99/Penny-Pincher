import SwiftUI

extension TemplatesView {
    func load() async {
        await viewModel.load()
    }

    func retry() {
        Task { await viewModel.load() }
    }

    func selectionChanged() {
        Task { await viewModel.selectionChanged() }
    }

    func dismissMessages() {
        viewModel.dismissMessages()
    }

    func createTemplate() {
        Task { await viewModel.createTemplate() }
    }

    func beginRename() {
        viewModel.beginRename()
    }

    func commitRename() {
        Task { await viewModel.commitRename() }
    }

    func deleteTemplate() {
        viewModel.requestDeleteTemplate()
    }

    func confirmDelete() {
        Task { await viewModel.confirmDelete() }
    }

    func cancelDelete() {
        viewModel.pendingDelete = nil
    }

    var deleteDialogPresented: Binding<Bool> {
        Binding(get: { viewModel.pendingDelete != nil }, set: { if !$0 { viewModel.pendingDelete = nil } })
    }

    func addExpense(_ categoryID: String) {
        viewModel.addExpenseItem(in: categoryID)
    }

    func editExpense(_ id: String) {
        viewModel.editExpenseItem(id)
    }

    func removeExpense(_ id: String) {
        viewModel.requestRemoveExpenseItem(id)
    }

    func addIncome() {
        viewModel.addIncomeItem()
    }

    func editIncome(_ id: String) {
        viewModel.editIncomeItem(id)
    }

    func removeIncome(_ id: String) {
        viewModel.requestRemoveIncomeItem(id)
    }

    func saveExpenseEditor() {
        guard let editor = viewModel.expenseEditor else { return }
        Task { if await editor.save() { viewModel.expenseEditor = nil } }
    }

    func saveIncomeEditor() {
        guard let editor = viewModel.incomeEditor else { return }
        Task { if await editor.save() { viewModel.incomeEditor = nil } }
    }

    func closeSheets() {
        viewModel.expenseEditor = nil
        viewModel.incomeEditor = nil
        viewModel.showsApplySheet = false
    }

    func beginApply() {
        viewModel.beginApply()
    }

    func previousApplyMonth() {
        viewModel.applyMonth.previous()
    }

    func nextApplyMonth() {
        viewModel.applyMonth.next()
    }

    func apply() {
        Task { await viewModel.apply() }
    }

    func confirmApplyReset() {
        Task { await viewModel.confirmApplyReset() }
    }

    func cancelApplyReset() {
        viewModel.applier.cancelReset()
    }

    var resetDialogPresented: Binding<Bool> {
        Binding(get: { viewModel.applier.pendingReset != nil },
                set: { if !$0 { viewModel.applier.cancelReset() } })
    }
}

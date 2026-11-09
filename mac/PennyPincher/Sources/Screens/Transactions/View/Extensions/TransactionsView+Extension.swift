import SwiftUI

extension TransactionsView {
    /// Tall enough for up to five entries, then it scrolls.
    var incomeTableHeight: CGFloat {
        CGFloat(min(viewModel.incomeEntries.count, 5)) * 24 + 32
    }

    func load() async {
        await viewModel.load()
    }

    func retry() {
        Task { await viewModel.load() }
    }

    func monthChanged() {
        Task { await viewModel.monthChanged() }
    }

    func previousMonth() {
        viewModel.month.previous()
    }

    func nextMonth() {
        viewModel.month.next()
    }

    func dismissMessages() {
        viewModel.dismissMessages()
    }

    func confirmAll() {
        Task { await viewModel.confirmAll() }
    }

    func confirmExpense(_ id: String) {
        Task { await viewModel.confirmExpense(id) }
    }

    func confirmIncome(_ id: String) {
        Task { await viewModel.confirmIncome(id) }
    }

    func editExpense(_ id: String) {
        viewModel.editExpense(id)
    }

    func editIncome(_ id: String) {
        viewModel.editIncome(id)
    }

    func editExpenseSelection(_ ids: Set<String>) {
        if ids.count == 1, let id = ids.first { viewModel.editExpense(id) }
    }

    func editIncomeSelection(_ ids: Set<String>) {
        if ids.count == 1, let id = ids.first { viewModel.editIncome(id) }
    }

    func deleteExpense(_ id: String) {
        viewModel.requestDeleteExpense(id)
    }

    func deleteIncome(_ id: String) {
        viewModel.requestDeleteIncome(id)
    }

    /// The Delete key on the expense table.
    func deleteSelection() {
        if viewModel.selection.count == 1, let id = viewModel.selection.first { viewModel.requestDeleteExpense(id) }
    }

    func linkRefund(_ id: String) {
        viewModel.linkRefund(id)
    }

    func showOriginal(_ id: String) {
        viewModel.showOriginal(id)
    }

    func showAllCategories() {
        viewModel.categoryFilter = nil
    }

    func toggleCategory(_ id: String) {
        viewModel.toggleCategory(id)
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

    func saveExpenseEditor() {
        guard let editor = viewModel.expenseEditor else { return }
        Task { if await editor.save() { viewModel.expenseEditor = nil } }
    }

    func saveIncomeEditor() {
        guard let editor = viewModel.incomeEditor else { return }
        Task { if await editor.save() { viewModel.incomeEditor = nil } }
    }

    func loadLinker() async {
        await viewModel.linker?.load()
    }

    func linkSelected() {
        guard let linker = viewModel.linker else { return }
        Task { if await linker.link() { viewModel.linker = nil } }
    }

    func closeSheets() {
        viewModel.expenseEditor = nil
        viewModel.incomeEditor = nil
        viewModel.linker = nil
    }
}

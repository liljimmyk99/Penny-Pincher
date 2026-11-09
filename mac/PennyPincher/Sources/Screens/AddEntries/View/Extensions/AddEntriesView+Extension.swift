import SwiftUI

extension AddEntriesView {
    func load() async {
        await viewModel.load()
        focusFirstBlankRow()
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

    func focusFirstBlankRow() {
        focus = .merchant(viewModel.firstBlankRow())
    }

    /// Return in a row: on to the next row's merchant, adding a row at the end.
    func rowSubmitted(_ id: UUID) {
        focus = .merchant(viewModel.rowAfter(id))
    }

    func addRow() {
        focus = .merchant(viewModel.addRow())
    }

    func addRefund() {
        focus = .merchant(viewModel.addRow(refund: true))
    }

    func removeRow(_ id: UUID) {
        viewModel.removeRow(id)
    }

    func merchantChanged(_ id: UUID) {
        viewModel.merchantChanged(id)
    }

    func loadRefundCandidates(_ id: UUID) {
        Task { await viewModel.loadRefundCandidates(id) }
    }

    func categoryBinding(_ id: UUID) -> Binding<String> {
        Binding(
            get: { viewModel.rows.first { $0.id == id }?.categoryID ?? "" },
            set: { viewModel.setCategory(id, $0) }
        )
    }

    func refundLinkBinding(_ id: UUID) -> Binding<String?> {
        Binding(
            get: { viewModel.rows.first { $0.id == id }?.refundedExpenseID },
            set: { viewModel.setRefundLink(id, $0) }
        )
    }

    func saveExpenses() {
        Task {
            await viewModel.saveExpenses()
            if viewModel.statusMessage != nil { focusFirstBlankRow() }
        }
    }

    func saveIncome() {
        Task {
            await viewModel.saveIncome()
            if viewModel.statusMessage != nil { focus = .incomeGross }
        }
    }

    func dismissStatus() {
        viewModel.dismissStatus()
    }
}

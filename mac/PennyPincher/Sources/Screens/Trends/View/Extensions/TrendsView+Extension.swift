import SwiftUI

extension TrendsView {
    func loadOnAppear() async {
        await viewModel.load()
    }

    func load() {
        Task { await viewModel.load() }
    }

    // MARK: Custom trends

    func retryTrend() {
        Task { await viewModel.custom.retrySelected() }
    }

    func selectMonth(_ period: String) {
        Task { await viewModel.custom.selectMonth(period) }
    }

    func clearMonth() {
        viewModel.custom.clearMonth()
    }

    func openInTransactions() {
        viewModel.custom.openInTransactions()
    }

    func newTrend() {
        viewModel.custom.startNewTrend()
    }

    func saveNewTrend() {
        guard let editor = viewModel.custom.newTrend else { return }
        Task { if await editor.save() { viewModel.custom.newTrend = nil } }
    }

    func cancelNewTrend() {
        viewModel.custom.newTrend = nil
    }

    // MARK: By category

    func previousYear() {
        viewModel.byCategory.previousYear()
    }

    func nextYear() {
        viewModel.byCategory.nextYear()
    }

    func yearChanged() {
        Task { await viewModel.byCategory.yearChanged() }
    }

    func selectYearMonth(_ id: String) {
        if let index = Int(id) { viewModel.byCategory.selectMonth(index) }
    }

    func toggleCategory(_ id: String) {
        viewModel.byCategory.toggleCategory(id)
    }
}

import SwiftUI

extension YearlyView {
    func load() async {
        await viewModel.load()
    }

    func retry() {
        Task { await viewModel.load() }
    }

    func yearChanged() {
        Task { await viewModel.yearChanged() }
    }

    func previousYear() {
        viewModel.previousYear()
    }

    func nextYear() {
        viewModel.nextYear()
    }

    func openMonth(_ month: String) {
        viewModel.open(month)
    }

    func tableSelectionChanged() {
        if let month = viewModel.selectedMonth {
            viewModel.open(month)
        }
    }

    /// The averages chart has nothing to select.
    func ignore(_ id: String) {}
}

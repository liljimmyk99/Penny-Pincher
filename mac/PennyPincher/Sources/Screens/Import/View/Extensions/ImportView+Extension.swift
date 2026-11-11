import SwiftUI

extension ImportView {
    @Sendable func load() async {
        await viewModel.load()
    }

    func dismissMessage() {
        viewModel.dismissMessage()
    }

    func downloadTemplate() {
        Task { await viewModel.downloadTemplate() }
    }

    func chooseFile() {
        isChoosingFile = true
    }

    func filePicked(_ result: Result<URL, any Error>) {
        guard case .success(let url) = result else { return }
        Task { await viewModel.upload(url: url) }
    }

    func filesDropped(_ urls: [URL], _ location: CGPoint) -> Bool {
        guard viewModel.stage == .upload || viewModel.stage == .review, let url = urls.first else { return false }
        Task { await viewModel.upload(url: url) }
        return true
    }

    func chooseDifferent() {
        Task { await viewModel.chooseDifferentFile() }
    }

    func downloadProblems() {
        Task { await viewModel.downloadReviewProblems() }
    }

    func start() {
        Task { await viewModel.startImport() }
    }

    func askCancel() {
        viewModel.isConfirmingCancel = true
    }

    func confirmCancel() {
        Task { await viewModel.cancelImport() }
    }

    func askUndo(_ summary: ImportSummary) {
        viewModel.askUndo(summary)
    }

    func confirmUndo() {
        Task { await viewModel.undo() }
    }

    func openYearly() {
        viewModel.openYearly()
    }

    func downloadSkipped() {
        Task { await viewModel.downloadSkippedRows() }
    }

    func importAnother() {
        viewModel.importAnother()
    }
}

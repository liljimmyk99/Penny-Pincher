import SwiftUI

extension SummaryView {
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

    func openIncome(_ sourceID: String) {
        Task { await viewModel.showIncome(sourceID) }
    }

    func closeIncome() {
        viewModel.closeIncome()
    }

    func highlight(_ id: String) {
        viewModel.toggleHighlight(id)
    }

    func addIncome() {
        viewModel.addIncome()
    }

    func addExpenses() {
        viewModel.addExpenses()
    }

    func review() {
        viewModel.reviewUnconfirmed()
    }

    func undoApply() {
        Task { await viewModel.templates.undo() }
    }

    func confirmAll() {
        Task { await viewModel.confirmAll() }
    }

    func selectTemplate(_ id: String) {
        Task { await viewModel.templates.select(id) }
    }

    func copyTemplate() {
        let id = viewModel.templates.selectedTemplateID
        Task { await viewModel.templates.apply(id) }
    }

    func startBlank() {
        viewModel.templates.startBlank()
    }

    func confirmReset() {
        Task { await viewModel.templates.confirmReset() }
    }

    func cancelReset() {
        viewModel.templates.cancelReset()
    }

    var resetDialogPresented: Binding<Bool> {
        Binding(get: { viewModel.templates.pendingReset != nil },
                set: { if !$0 { viewModel.templates.cancelReset() } })
    }

    func openWelcomeStep(_ kind: WelcomeStep.Kind) {
        viewModel.openWelcomeStep(kind)
    }

    func hideWelcome() {
        viewModel.hideWelcome()
    }
}

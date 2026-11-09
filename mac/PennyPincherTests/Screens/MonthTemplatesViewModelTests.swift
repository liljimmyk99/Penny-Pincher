import Foundation
import Testing
@testable import PennyPincher

@MainActor
@Suite("Month templates view model")
struct MonthTemplatesViewModelTests {
    let api = Fixture.ledger { $0.templates = [Fixture.template(), Fixture.template("empty", name: "Empty", days: [])
        .withoutItems()] }
    let month = MonthSelection(month: "2026-11")

    private func loaded() async -> MonthTemplatesViewModel {
        let viewModel = MonthTemplatesViewModel(api: api, month: month)
        await viewModel.load()
        return viewModel
    }

    @Test("The offer lists templates with items and previews the first, in day order, with totals")
    func offer() async {
        let viewModel = await loaded()
        #expect(viewModel.canOffer)
        #expect(viewModel.offerTemplates.map(\.id) == ["t1"])
        #expect(viewModel.selectedTemplateID == "t1")
        #expect(viewModel.previewRows.map(\.dayText) == ["1", "15", "31"])
        #expect(viewModel.previewRows.map(\.title) == ["Corner Store", "Job · Paycheck", "Corner Store"])
        let totals = viewModel.previewTotals
        #expect(totals?.netIncomeCents == 200_000)
        #expect(totals?.spendingCents == 20_000)
        #expect(totals?.leftOverCents == 180_000)
        #expect(viewModel.offerTitle == "Start November 2026 from your template?")
    }

    @Test("Start blank hides the offer until the month changes")
    func startBlank() async {
        let viewModel = await loaded()
        viewModel.startBlank()
        #expect(!viewModel.canOffer)
        await viewModel.monthChanged()
        #expect(viewModel.canOffer)
    }

    @Test("No offer when every template is empty")
    func noOffer() async {
        let api = Fixture.ledger { $0.templates = [Fixture.template(days: []).withoutItems()] }
        let viewModel = MonthTemplatesViewModel(api: api, month: month)
        await viewModel.load()
        #expect(!viewModel.canOffer)
    }

    @Test("Applying to an empty month copies unconfirmed entries and offers Undo")
    func apply() async throws {
        let viewModel = await loaded()
        var changed = 0
        viewModel.onChange = { changed += 1 }
        await viewModel.apply("t1")
        #expect(api.with { $0.applyRequests.map(\.reset) } == [false])
        let apply = try #require(viewModel.undoableApply)
        #expect(apply.createdCount == 3 && apply.unconfirmedCount == 3)
        #expect(viewModel.statusMessage == "3 items copied into November 2026, unconfirmed until you check each one.")
        #expect(changed == 1)
        // Days 29–31 land on the last day of a shorter month.
        #expect(api.with { $0.expenses.map(\.date).sorted() } == ["2026-11-01", "2026-11-30"])
    }

    @Test("A month with data asks for the reset first; confirming retries with reset_month")
    func reset() async {
        api.with { $0.expenses = [Fixture.expense("old", "2026-11-04", 500), Fixture.expense("older", "2026-11-05", 700)]
            $0.income = [Fixture.income("pay", "2026-11-06")] }
        let viewModel = await loaded()
        viewModel.counts = { MonthCounts(expenses: 2, income: 1) }
        await viewModel.apply("t1")
        let request = viewModel.pendingReset
        #expect(request?.title == "Replace everything in November 2026?")
        #expect(request?.message.contains("2 expenses and 1 income entries") == true)
        #expect(api.with { $0.expenses.count } == 2, "nothing is deleted before the user confirms")
        #expect(viewModel.undoableApply == nil)

        await viewModel.confirmReset()
        #expect(viewModel.pendingReset == nil)
        #expect(api.with { $0.applyRequests.map(\.reset) } == [false, true])
        #expect(api.with { $0.expenses.map(\.id).contains("old") } == false)
        #expect(viewModel.undoableApply != nil)
        #expect(viewModel.statusMessage == "3 items copied. 3 existing entries were deleted.")
    }

    @Test("Cancelling the reset changes nothing")
    func cancelReset() async {
        api.with { $0.expenses = [Fixture.expense("old", "2026-11-04", 500)] }
        let viewModel = await loaded()
        await viewModel.apply("t1")
        viewModel.cancelReset()
        #expect(viewModel.pendingReset == nil)
        #expect(api.with { $0.applyRequests.count } == 1)
        #expect(api.with { $0.expenses.map(\.id) } == ["old"])
    }

    @Test("Undo removes the unconfirmed copies and then hides itself")
    func undo() async {
        let viewModel = await loaded()
        await viewModel.apply("t1")
        await viewModel.undo()
        #expect(api.with { $0.expenses.isEmpty && $0.income.isEmpty })
        #expect(viewModel.undoableApply == nil)
        #expect(viewModel.statusMessage == "Removed 3 unconfirmed entries.")
    }

    @Test("Undo is hidden once everything is confirmed")
    func undoHiddenWhenConfirmed() async throws {
        let viewModel = await loaded()
        await viewModel.apply("t1")
        try await api.confirmAll(month: "2026-11")
        await viewModel.refreshApplies()
        #expect(viewModel.undoableApply == nil)
    }

    @Test("A failed apply shows the server's message")
    func failure() async {
        api.with { $0.failures["applyTemplate:2026-11:t1:false"] = APIError.code("internal", status: 500) }
        let viewModel = await loaded()
        await viewModel.apply("t1")
        #expect(viewModel.errorMessage != nil)
        #expect(viewModel.pendingReset == nil)
    }
}

private extension Template {
    func withoutItems() -> Template {
        var copy = self
        copy.expenseItems = []
        copy.incomeItems = []
        return copy
    }
}

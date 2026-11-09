import Foundation
import Testing
@testable import PennyPincher

/// The unconfirmed flow and the new-month offer on the Transactions screen.
@MainActor
@Suite("Transactions: templates and unconfirmed")
struct TransactionsTemplatesTests {
    let api = Fixture.ledger { $0.templates = [Fixture.template()] }
    let month = MonthSelection(month: "2026-11")

    private func loaded() async -> TransactionsViewModel {
        let viewModel = TransactionsViewModel(api: api, month: month)
        await viewModel.load()
        return viewModel
    }

    @Test("An empty month shows the new-month offer; Start blank hides it")
    func offer() async {
        let viewModel = await loaded()
        #expect(viewModel.showsNewMonthOffer)
        viewModel.templates.startBlank()
        #expect(!viewModel.showsNewMonthOffer)
    }

    @Test("A month with entries shows no offer")
    func noOfferWithData() async {
        api.with { $0.expenses = [Fixture.expense("a", "2026-11-02", 500)] }
        let viewModel = await loaded()
        #expect(!viewModel.showsNewMonthOffer)
    }

    @Test("Copying fills the month with unconfirmed rows and a banner with Undo")
    func copy() async {
        let viewModel = await loaded()
        await viewModel.templates.apply("t1")
        #expect(!viewModel.showsNewMonthOffer)
        #expect(viewModel.unconfirmedCount == 3)
        #expect(viewModel.rows.allSatisfy { $0.isUnconfirmed })
        #expect(viewModel.templates.undoableApply != nil)
        #expect(viewModel.bannerText == "3 items copied from Typical · unconfirmed until you check each one")
        #expect(viewModel.noticeMessage != nil && !viewModel.noticeIsError)
    }

    @Test("Undo empties the month again and the banner goes")
    func undo() async {
        let viewModel = await loaded()
        await viewModel.templates.apply("t1")
        await viewModel.templates.undo()
        #expect(viewModel.unconfirmedCount == 0)
        #expect(viewModel.isMonthEmpty)
        #expect(viewModel.templates.undoableApply == nil)
    }

    @Test("Confirming everything hides Undo and the plain count text returns for stragglers")
    func confirmAllHidesUndo() async {
        let viewModel = await loaded()
        await viewModel.templates.apply("t1")
        await viewModel.confirmAll()
        #expect(viewModel.unconfirmedCount == 0)
        #expect(viewModel.templates.undoableApply == nil)
    }

    @Test("Confirming one row keeps Undo for the rest")
    func confirmOne() async {
        let viewModel = await loaded()
        await viewModel.templates.apply("t1")
        let id = viewModel.rows[0].id
        await viewModel.confirmExpense(id)
        #expect(viewModel.unconfirmedCount == 2)
        #expect(viewModel.templates.undoableApply?.unconfirmedCount == 2)
    }

    @Test("Applying to a month with data asks for the reset using the loaded counts")
    func resetCounts() async {
        api.with { $0.expenses = [Fixture.expense("a", "2026-11-02", 500), Fixture.expense("b", "2026-11-03", 700)]
            $0.income = [Fixture.income("pay", "2026-11-05", confirmed: false)] }
        let viewModel = await loaded()
        await viewModel.templates.apply("t1")
        #expect(viewModel.templates.pendingReset?.message.contains("2 expenses and 1 income entries") == true)
        await viewModel.templates.confirmReset()
        #expect(viewModel.expenses.map(\.id).contains("a") == false)
        #expect(viewModel.unconfirmedCount == 3)
    }

    @Test("Review narrows to unconfirmed entries and resets when none are left")
    func review() async {
        api.with { $0.expenses = [Fixture.expense("done", "2026-11-02", 500),
                                  Fixture.expense("todo", "2026-11-03", 700, confirmed: false)]
            $0.income = [Fixture.income("pay", "2026-11-05", confirmed: false),
                         Fixture.income("pay2", "2026-11-06")] }
        let viewModel = await loaded()
        viewModel.toggleReview()
        #expect(viewModel.rows.map(\.id) == ["todo"])
        #expect(viewModel.incomeRows.map(\.id) == ["pay"])
        #expect(viewModel.isFiltered)
        await viewModel.confirmAll()
        #expect(!viewModel.showUnconfirmedOnly)
        #expect(viewModel.rows.count == 2)
    }

    @Test("Changing month reloads that month's applies and brings the offer back")
    func monthChange() async {
        let viewModel = await loaded()
        viewModel.templates.startBlank()
        month.next()
        await viewModel.monthChanged()
        #expect(viewModel.showsNewMonthOffer)
    }
}

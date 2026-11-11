import Foundation
import Testing
@testable import PennyPincher

@MainActor
@Suite("Summary view model")
struct SummaryViewModelTests {
    let defaults = UserDefaults(suiteName: "summary-tests-\(UUID().uuidString)")!
    let month = MonthSelection(month: "2026-10")

    static func category(_ base: ExpenseCategory, _ total: Int, previous: Int, count: Int = 1) -> MonthlySummary.Category {
        MonthlySummary.Category(id: base.id, name: base.name, color: nil, isSaving: base.isSaving,
                                isProtected: base.isProtected, totalCents: total, expenseCount: count, refundCount: 0,
                                previousMonthTotalCents: previous)
    }

    static func summary(month: String = "2026-10", unconfirmed: Int = 0, applies: [TemplateApply] = []) -> MonthlySummary {
        let job = IncomeTotals(grossCents: 300_000, grossTaxableCents: 270_000, netCents: 200_000, entryCount: 2)
        return MonthlySummary(
            month: month,
            sources: [MonthlySummary.Source(id: Fixture.job.id, name: "Job", isProtected: false, totals: job),
                      MonthlySummary.Source(id: Fixture.gig.id, name: "Gig", isProtected: false, totals: .zero)],
            combined: job,
            categories: [category(Fixture.saving, 40_000, previous: 30_000), category(Fixture.food, 60_000, previous: 50_000),
                         category(Fixture.fun, 0, previous: 5_000, count: 0), category(Fixture.other, -500, previous: 0)],
            totalCents: 99_500, savingCents: 40_000, previousMonthTotalCents: 85_000, leftOverCents: 100_500,
            unconfirmedExpenseCount: unconfirmed, unconfirmedIncomeCount: 0, applies: applies, isEmpty: false)
    }

    private func make(_ summary: MonthlySummary? = nil, today: String = "2026-10-15",
                      _ change: (inout FakeLedgerAPI.State) -> Void = { _ in }) -> (SummaryViewModel, FakeLedgerAPI) {
        let api = Fixture.ledger { state in
            state.monthly["2026-10"] = summary ?? Self.summary()
            change(&state)
        }
        return (SummaryViewModel(api: api, month: month, defaults: defaults, today: { today }), api)
    }

    @Test("Tiles show net income, spent, saved and left over with changes from last month")
    func tiles() async {
        let (viewModel, _) = make()
        await viewModel.load()
        #expect(viewModel.phase == .loaded)
        #expect(viewModel.tiles.map(\.valueText) == ["$2,000.00", "$995.00", "$400.00", "$1,005.00"])
        let spent = viewModel.tiles[1].change
        #expect(spent?.tone == .worse && spent?.arrow == "▲")
        // Saving more than last month is better (blue), not worse.
        let saved = viewModel.tiles[2].change
        #expect(saved?.tone == .better && saved?.amountText == "+$100.00")
        #expect(viewModel.tiles[3].change == nil)
    }

    @Test("Categories are ranked largest first, skip those netting to zero or below, and keep Saving's colour flag")
    func ranked() async {
        let (viewModel, _) = make()
        await viewModel.load()
        let items = viewModel.rankedItems
        #expect(items.map(\.name) == ["Food", "Saving"])
        #expect(items[0].detailText == "30% of income")
        #expect(items[1].isSaving)
        #expect(items[1].change?.tone == .better)
        #expect(items[0].change?.tone == .worse)
    }

    @Test("Selecting a category only highlights it; selecting it again clears it")
    func highlightOnly() async {
        let (viewModel, api) = make()
        await viewModel.load()
        let calls = api.calls.count
        viewModel.toggleHighlight("c-food")
        #expect(viewModel.highlightedCategoryID == "c-food")
        viewModel.toggleHighlight("c-saving")
        #expect(viewModel.highlightedCategoryID == "c-saving")
        viewModel.toggleHighlight("c-saving")
        #expect(viewModel.highlightedCategoryID == nil)
        #expect(api.calls.count == calls)
        #expect(viewModel.incomeDetail == nil)
    }

    @Test("Only sources with entries are listed, with a combined line")
    func incomeRows() async {
        let (viewModel, _) = make()
        await viewModel.load()
        #expect(viewModel.incomeRows.map(\.name) == ["Job"])
        #expect(viewModel.incomeRows[0].taxRateText == "25.9%")
        #expect(viewModel.combinedRow?.netText == "$2,000.00")
    }

    @Test("A source opens its entries with its total and the combined total")
    func incomeSheet() async {
        let (viewModel, api) = make { state in
            state.income = [Fixture.income("a", "2026-10-01", net: 100_000), Fixture.income("b", "2026-10-15", net: 100_000),
                            Fixture.income("g", "2026-10-20", source: Fixture.gig.id)]
        }
        await viewModel.load()
        await viewModel.showIncome(Fixture.job.id)
        let detail = viewModel.incomeDetail
        #expect(api.calls.contains("incomeEntries:2026-10"))
        #expect(detail?.rows.map(\.id) == ["b", "a"])
        #expect(detail?.total.netText == "$2,000.00")
        #expect(detail?.combined.source == "All sources combined")
        viewModel.closeIncome()
        #expect(viewModel.incomeDetail == nil)
    }

    @Test("The banner counts unconfirmed entries, and Confirm all as-is reloads")
    func banner() async {
        let (viewModel, api) = make(Self.summary(unconfirmed: 3))
        await viewModel.load()
        #expect(viewModel.unconfirmedCount == 3)
        api.with { $0.monthly["2026-10"] = Self.summary(unconfirmed: 0) }
        await viewModel.confirmAll()
        #expect(api.calls.contains("confirmAll:2026-10"))
        #expect(viewModel.unconfirmedCount == 0)
        #expect(viewModel.noticeMessage != nil)
    }

    @Test("Review asks the window to open Transactions")
    func review() async {
        let (viewModel, _) = make(Self.summary(unconfirmed: 1))
        var reviewed = false
        viewModel.review = { reviewed = true }
        viewModel.reviewUnconfirmed()
        #expect(reviewed)
    }

    @Test("An empty month with a template offers it; a month with data does not")
    func newMonthOffer() async {
        var empty = Self.summary()
        empty.isEmpty = true
        let (viewModel, _) = make(empty) { $0.templates = [Fixture.template()] }
        await viewModel.load()
        #expect(viewModel.showsNewMonthOffer)
        viewModel.templates.startBlank()
        #expect(!viewModel.showsNewMonthOffer)

        let (busy, _) = make { $0.templates = [Fixture.template()] }
        await busy.load()
        #expect(!busy.showsNewMonthOffer)
    }

    @Test("The welcome checklist shows on an empty current month, remembers its steps and can be hidden")
    func welcome() async {
        var empty = Self.summary()
        empty.isEmpty = true
        let (viewModel, _) = make(empty)
        await viewModel.load()
        #expect(viewModel.showsWelcome)
        #expect(viewModel.welcomeSteps.map(\.isDone) == [false, false, false])

        var went: [SidebarItem] = []
        viewModel.navigate = { went.append($0) }
        viewModel.openWelcomeStep(.categories)
        viewModel.openWelcomeStep(.template)
        viewModel.openWelcomeStep(.entry)
        #expect(went == [.categories, .templates, .addEntries])
        #expect(viewModel.welcomeSteps[0].isDone)
        #expect(defaults.bool(forKey: SummaryViewModel.categoriesCheckedKey))

        viewModel.hideWelcome()
        #expect(!viewModel.showsWelcome)
        #expect(defaults.bool(forKey: SummaryViewModel.welcomeHiddenKey))
    }

    @Test("The welcome checklist stays away from past months and months with data")
    func welcomeNotShown() async {
        var empty = Self.summary()
        empty.isEmpty = true
        let (past, _) = make(empty, today: "2026-12-02")
        await past.load()
        #expect(!past.showsWelcome)

        let (busy, _) = make()
        await busy.load()
        #expect(!busy.showsWelcome)
    }

    @Test("An empty month shows muted zero tiles without changes")
    func emptyTiles() async {
        var empty = Self.summary()
        empty.isEmpty = true
        let (viewModel, _) = make(empty)
        await viewModel.load()
        #expect(viewModel.tiles.allSatisfy { $0.change == nil })
    }

    @Test("A failed load shows the error; changing month loads that month")
    func failureAndMonthChange() async {
        let (viewModel, api) = make { $0.failures["monthlySummary:2026-10"] = APIError.network() }
        await viewModel.load()
        #expect(viewModel.phase.errorMessage != nil)

        api.with { $0.failures = [:]; $0.monthly["2026-09"] = Self.summary(month: "2026-09") }
        month.previous()
        await viewModel.monthChanged()
        #expect(viewModel.summary?.month == "2026-09")
        month.next()
    }
}

import Foundation
import SwiftUI
import Testing
@testable import PennyPincher

@MainActor
@Suite("By-category trends view model")
struct CategoryTrendsViewModelTests {
    static func months(_ values: [Int: Int]) -> [Int] {
        (0..<12).map { values[$0] ?? 0 }
    }

    static var trends: CategoryTrends {
        let food = CategoryTrends.Series(categoryID: "c-food", name: "Food", color: nil, isSaving: false,
                                         thisYearCents: months([0: 10_000, 1: 12_000, 2: 9_000]),
                                         lastYearCents: months([0: 8_000, 2: 9_000, 11: 11_000]))
        let saving = CategoryTrends.Series(categoryID: "c-saving", name: "Saving", color: nil, isSaving: true,
                                           thisYearCents: months([0: 50_000, 1: 40_000, 2: 60_000]),
                                           lastYearCents: months([2: 50_000]))
        let all = CategoryTrends.Series(categoryID: nil, name: "All spending", color: nil, isSaving: false,
                                        thisYearCents: months([0: 60_000, 1: 52_000, 2: 69_000]),
                                        lastYearCents: months([0: 8_000, 2: 59_000, 11: 11_000]))
        return CategoryTrends(year: 2026, allSpending: all, categories: [saving, food])
    }

    private func make() -> (CategoryTrendsViewModel, FakeLedgerAPI) {
        let api = Fixture.ledger { $0.categoryTrends[2026] = Self.trends }
        return (CategoryTrendsViewModel(api: api, today: { "2026-03-15" }), api)
    }

    @Test("The month defaults to the current one this year, December otherwise")
    func defaultMonth() {
        #expect(CategoryTrendsViewModel.defaultMonthIndex(year: 2026, today: "2026-03-15") == 2)
        #expect(CategoryTrendsViewModel.defaultMonthIndex(year: 2025, today: "2026-03-15") == 11)
        let (viewModel, _) = make()
        #expect(viewModel.year == 2026 && viewModel.monthIndex == 2)
    }

    @Test("All spending: the month's spend and its changes; spending more is worse")
    func allSpending() async throws {
        let (viewModel, api) = make()
        await viewModel.load()
        #expect(api.calls == ["categoryTrends:2026"])
        #expect(viewModel.options.map(\.name) == ["All spending", "Saving", "Food"])
        let tiles = viewModel.tiles
        #expect(tiles.map(\.title) == ["March spend", "vs. previous month", "vs. March 2025", "Year to date vs. last year"])
        #expect(tiles.map(\.valueText) == ["$690.00", "$520.00", "$590.00", "$1,810.00"])
        #expect(tiles[0].caption == "All spending")
        let month = try #require(tiles[1].change)
        #expect(month.tone == .worse && month.text == "▲ +$170.00 (+33%)" && month.suffix == "vs. last month")
        #expect(tiles[3].change?.suffix == "vs. $670.00 last year")
    }

    @Test("Saving's colours flip: saving more than last month and last year is better")
    func savingFlips() async {
        let (viewModel, _) = make()
        await viewModel.load()
        viewModel.selectedCategoryID = "c-saving"
        #expect(viewModel.seriesName == "Saving")
        #expect(viewModel.tiles.compactMap(\.change).map(\.tone) == [.better, .better, .better])
        #expect(viewModel.tiles[0].tint == .saving)
        #expect(viewModel.rows[1].previousMonthChange?.tone == .worse)
    }

    @Test("January compares with last December in the table; months after today show a dash")
    func table() async {
        let (viewModel, _) = make()
        await viewModel.load()
        viewModel.selectedCategoryID = "c-food"
        let rows = viewModel.rows
        #expect(rows.count == 12)
        #expect(rows[0].previousMonthChange?.text == "▼ −$10.00 (−9%)")
        #expect(rows[0].previousMonthChange?.tone == .better)
        #expect(rows[0].previousMonthChange?.suffix == "vs. last December")
        #expect(rows[0].lastYearChange?.tone == .worse)
        #expect(rows[2].lastYearChange?.text == "No change")
        #expect(rows[2].yearToDateText == "$310.00")
        #expect(rows[3].isFuture && rows[3].spendText == "—" && rows[3].previousMonthChange == nil)
        #expect(rows[3].lastYearText == "$0.00")
        #expect(viewModel.lastYearChangeColumnTitle == "vs. 2025")
    }

    @Test("Biggest movers rank the month's changes vs. last year; choosing one charts it, again clears it")
    func movers() async {
        let (viewModel, _) = make()
        await viewModel.load()
        #expect(viewModel.movers.map(\.name) == ["Saving"])
        #expect(viewModel.movers[0].tone == .better && viewModel.movers[0].changeText == "▲ +$100.00")
        viewModel.selectMonth(0)
        #expect(viewModel.movers.map(\.name) == ["Saving", "Food"])
        viewModel.toggleCategory("c-food")
        #expect(viewModel.selectedCategoryID == "c-food")
        viewModel.toggleCategory("c-food")
        #expect(viewModel.selectedCategoryID == nil)
        viewModel.selectMonth(5)
        #expect(viewModel.movers.isEmpty)
        #expect(viewModel.moversEmptyText == "No category changed in June.")
    }

    @Test("Paired bars and the table select the month")
    func selection() async {
        let (viewModel, _) = make()
        await viewModel.load()
        #expect(viewModel.pairs.count == 12)
        #expect(viewModel.pairs[2].thisYearCents == 69_000 && viewModel.pairs[2].lastYearCents == 59_000)
        #expect(viewModel.pairsTitle == "2026 vs. 2025")
        viewModel.selectedRowID = "0"
        #expect(viewModel.monthIndex == 0 && viewModel.tiles[0].title == "January spend")
        #expect(viewModel.tiles[1].change?.suffix == "vs. last December")
        viewModel.selectedRowID = nil
        #expect(viewModel.monthIndex == 0)
    }

    @Test("Another year starts from all spending and December; years stay within 2000–2100")
    func years() async {
        let (viewModel, api) = make()
        await viewModel.load()
        viewModel.selectedCategoryID = "c-food"
        viewModel.previousYear()
        await viewModel.yearChanged()
        #expect(api.calls.last == "categoryTrends:2025")
        #expect(viewModel.selectedCategoryID == nil && viewModel.monthIndex == 11)
        #expect(viewModel.trends?.year == 2025)

        viewModel.year = 2000
        #expect(!viewModel.canGoToPreviousYear)
        viewModel.previousYear()
        #expect(viewModel.year == 2000)
        viewModel.year = 2100
        viewModel.nextYear()
        #expect(viewModel.year == 2100)
    }

    @Test("A failed first load shows the error")
    func failure() async {
        let (viewModel, api) = make()
        api.with { $0.failures["categoryTrends:2026"] = APIError.network() }
        await viewModel.load()
        #expect(viewModel.phase.errorMessage != nil)
    }
}

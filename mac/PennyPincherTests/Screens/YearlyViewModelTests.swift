import Foundation
import Testing
@testable import PennyPincher

@MainActor
@Suite("Yearly view model")
struct YearlyViewModelTests {
    static func month(_ index: Int, net: Int, spent: Int, saving: Int = 0, entries: Bool = true) -> YearlySummary.Month {
        YearlySummary.Month(month: "2026-\(index < 10 ? "0" : "")\(index)", grossCents: net, grossTaxableCents: net,
                            netCents: net, spentCents: spent, savingCents: saving, leftOverCents: net - spent,
                            hasEntries: entries)
    }

    static var summary: YearlySummary {
        var months = (1...12).map { month($0, net: 0, spent: 0, entries: false) }
        months[0] = month(1, net: 200_000, spent: 150_000, saving: 40_000)
        months[1] = month(2, net: 200_001, spent: 100_001, saving: 20_000)
        months[2] = month(3, net: 200_000, spent: 120_000)
        return YearlySummary(
            year: 2026, months: months,
            categories: [
                YearlySummary.Category(id: "c-saving", name: "Saving", color: nil, isSaving: true, isProtected: false,
                                       totalCents: 60_000, monthlyAverageCents: 20_000),
                YearlySummary.Category(id: "c-food", name: "Food", color: nil, isSaving: false, isProtected: false,
                                       totalCents: 90_001, monthlyAverageCents: 30_000),
                YearlySummary.Category(id: "c-fun", name: "Fun", color: nil, isSaving: false, isProtected: false,
                                       totalCents: 0, monthlyAverageCents: 0),
            ],
            totals: .init(grossCents: 600_001, grossTaxableCents: 600_001, netCents: 600_001, spentCents: 370_002,
                          savingCents: 60_000, leftOverCents: 229_999),
            averageMonthCount: 3)
    }

    private func make(_ summary: YearlySummary = Self.summary) -> (YearlyViewModel, FakeLedgerAPI) {
        let api = Fixture.ledger { $0.yearly[2026] = summary }
        return (YearlyViewModel(api: api, today: "2026-10-15"), api)
    }

    @Test("Averages divide by the months with entries and round half away from zero",
          arguments: [(600_001, 3, 200_000), (5, 2, 3), (-5, 2, -3), (4, 2, 2), (100, 0, 0)])
    func averages(total: Int, months: Int, expected: Int) {
        #expect(YearlyViewModel.averageCents(total, months: months) == expected)
    }

    @Test("It loads the current year and shows tiles with monthly averages")
    func tiles() async {
        let (viewModel, api) = make()
        #expect(viewModel.year == 2026)
        await viewModel.load()
        #expect(api.calls == ["yearlySummary:2026"])
        #expect(viewModel.tiles.map(\.value) == ["$6,000.01", "$3,700.02", "$600.00", "$2,299.99"])
        #expect(viewModel.tiles.map(\.detail) == ["$2,000.00 a month on average", "$1,233.34 a month on average",
                                                   "$200.00 a month on average", "$766.66 a month on average"])
    }

    @Test("Paired bars cover all twelve months; category averages are ranked and skip zeros")
    func charts() async {
        let (viewModel, _) = make()
        await viewModel.load()
        #expect(viewModel.pairedBars.count == 12)
        #expect(viewModel.pairedBars[0].label == "Jan")
        #expect(viewModel.pairedBars[0].netCents == 200_000 && viewModel.pairedBars[0].spentCents == 150_000)
        #expect(viewModel.averageItems.map(\.name) == ["Food", "Saving"])
        #expect(viewModel.averageItems[1].isSaving)
        #expect(viewModel.averageItems.allSatisfy { $0.change == nil })
        #expect(viewModel.hasData)
    }

    @Test("The table has a row per month, a dash for months without entries, and total and average rows")
    func table() async {
        let (viewModel, _) = make()
        await viewModel.load()
        #expect(viewModel.rows.count == 12)
        #expect(viewModel.rows[0].title == "January")
        #expect(viewModel.rows[0].netText == "$2,000.00")
        #expect(viewModel.rows[5].netText == "—" && viewModel.rows[5].spentText == "—" && viewModel.rows[5].leftOverText == "—")
        #expect(viewModel.totalRow?.spentText == "$3,700.02")
        #expect(viewModel.averageRow?.spentText == "$1,233.34")
    }

    @Test("Choosing a month opens its Summary")
    func opening() async {
        let (viewModel, _) = make()
        var opened: [String] = []
        viewModel.openMonth = { opened.append($0) }
        viewModel.selectedMonth = "2026-03"
        viewModel.open("2026-03")
        #expect(opened == ["2026-03"])
        #expect(viewModel.selectedMonth == nil)
        viewModel.open("total")
        #expect(opened == ["2026-03"])
    }

    @Test("Switching year loads that year; a failed first load shows the error")
    func yearSwitch() async {
        let (viewModel, api) = make()
        await viewModel.load()
        viewModel.previousYear()
        #expect(viewModel.yearTitle == "2025" && viewModel.nextYearTitle == "2026")
        await viewModel.yearChanged()
        #expect(api.calls.last == "yearlySummary:2025")
        #expect(viewModel.summary?.year == 2025)
        #expect(!viewModel.hasData)

        let (failing, failingAPI) = make()
        failingAPI.with { $0.failures["yearlySummary:2026"] = APIError.network() }
        await failing.load()
        #expect(failing.phase.errorMessage != nil)
    }
}

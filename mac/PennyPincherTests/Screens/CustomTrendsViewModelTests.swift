import Foundation
import Testing
@testable import PennyPincher

@MainActor
@Suite("Custom trends view model")
struct CustomTrendsViewModelTests {
    static let storeTrend = SavedTrend(id: "t1", name: "Store runs", matchType: .merchant, merchantID: Fixture.store.id,
                                       categoryID: nil, matchText: nil, measure: .amount, sortOrder: 0)
    static let noteTrend = SavedTrend(id: "t2", name: "Weekly", matchType: .note, merchantID: nil, categoryID: nil,
                                      matchText: "weekly", measure: .count, sortOrder: 1)

    private func make(_ change: (inout FakeLedgerAPI.State) -> Void = { _ in }) -> (CustomTrendsViewModel, FakeLedgerAPI) {
        let api = Fixture.ledger { state in
            state.merchants = [Fixture.store, Fixture.cafe]
            state.savedTrends = [Self.storeTrend, Self.noteTrend]
            state.trendBuckets[Fixture.store.id] = [TrendBucket(period: "2026-02", totalCents: 5_000, count: 2),
                                                    TrendBucket(period: "2026-03", totalCents: 3_000, count: 1)]
            state.expenses = [
                Fixture.expense("e1", "2026-02-03", 2_500, merchant: Fixture.store),
                Fixture.expense("e2", "2026-02-10", 1_000, merchant: Fixture.cafe),
                Fixture.expense("e3", "2026-02-20", -500, merchant: Fixture.store, note: "Returned"),
            ]
            change(&state)
        }
        return (CustomTrendsViewModel(api: api, today: { "2026-03-15" }), api)
    }

    @Test("It loads the saved trends, names and each trend's last twelve months")
    func load() async {
        let (viewModel, api) = make()
        await viewModel.load()
        #expect(api.calls == ["savedTrends", "categories", "allMerchants", "customTrend:m-store", "customTrend:weekly"])
        #expect(api.with { $0.trendQueries.first }
            == CustomTrendQuery(merchantID: "m-store", from: "2025-04-01", to: "2026-03-31"))
        #expect(viewModel.selectedID == "t1" && viewModel.measure == .amount)
        #expect(viewModel.rows.map(\.detail) == ["Merchant: Corner Store · Amount", "Note contains “weekly” · Count"])
        #expect(viewModel.rows[0].values.count == 12)
        #expect(viewModel.rows[0].values.suffix(2) == [5_000, 3_000])
        #expect(viewModel.pills == ["Merchant: Corner Store", "Tracking since February 2026"])
    }

    @Test("Tiles: year to date, monthly average with its change, peak month, average per visit")
    func tiles() async throws {
        let (viewModel, _) = make()
        await viewModel.load()
        let tiles = viewModel.tiles
        #expect(tiles.map(\.valueText) == ["$80.00", "$40.00", "$50.00", "$26.67"])
        #expect(tiles[0].caption == "2026")
        let change = try #require(tiles[1].change)
        #expect(change.tone == .better && change.text == "▼ −$20.00")
        #expect(tiles[2].caption == "February 2026")
        #expect(tiles[3].caption == "Last 12 months")

        viewModel.measure = .count
        #expect(viewModel.tiles.map(\.valueText) == ["3", "2", "2", "$26.67"])
        #expect(viewModel.chartTitle == "Per month · Count")
        #expect(viewModel.bars.last?.value == 1 && viewModel.bars.last?.label == "Mar")
    }

    @Test("Selecting a bar lists that month's matching entries; selecting it again clears them")
    func monthEntries() async {
        let (viewModel, _) = make()
        await viewModel.load()
        await viewModel.selectMonth("2026-02")
        #expect(viewModel.selectedMonth == "2026-02")
        #expect(viewModel.entriesTitle == "February 2026 entries")
        #expect(viewModel.entryRows.map(\.id) == ["e3", "e1"])
        #expect(viewModel.entryRows[0].isRefund)
        #expect(viewModel.entryRows[0].detail == "Food · Returned · Refund")
        #expect(viewModel.entryRows[0].amountText == "−$5.00")
        #expect(viewModel.transactionsLink == TransactionsLink(month: "2026-02", search: "Corner Store"))

        var opened: [TransactionsLink] = []
        viewModel.openTransactions = { opened.append($0) }
        viewModel.openInTransactions()
        #expect(opened == [TransactionsLink(month: "2026-02", search: "Corner Store")])

        await viewModel.selectMonth("2026-02")
        #expect(viewModel.selectedMonth == nil && viewModel.entries.isEmpty)

        await viewModel.selectMonth("2026-01")
        #expect(viewModel.entriesEmptyText == "No matching entries in January.")
    }

    @Test("Choosing another trend uses its own measure and clears the month")
    func switching() async {
        let (viewModel, _) = make()
        await viewModel.load()
        viewModel.measure = .count
        await viewModel.selectMonth("2026-02")
        viewModel.selectedID = "t2"
        #expect(viewModel.measure == .count)
        #expect(viewModel.selectedMonth == nil)
        viewModel.selectedID = "t1"
        #expect(viewModel.measure == .amount)
    }

    @Test("A failed first load shows the error; a trend whose months fail can be retried")
    func failures() async {
        let (failing, failingAPI) = make()
        failingAPI.with { $0.failures["savedTrends"] = APIError.network() }
        await failing.load()
        #expect(failing.phase.errorMessage != nil)

        let (viewModel, api) = make()
        api.with { $0.failures["customTrend:m-store"] = APIError.network() }
        await viewModel.load()
        #expect(viewModel.phase == .loaded)
        #expect(viewModel.detailPhase.errorMessage != nil)
        #expect(viewModel.tiles.isEmpty)
        api.with { $0.failures = [:] }
        await viewModel.retrySelected()
        #expect(viewModel.detailPhase == .loaded)
        #expect(!viewModel.tiles.isEmpty)
    }

    @Test("No saved trends shows the empty state")
    func empty() async {
        let (viewModel, _) = make { $0.savedTrends = [] }
        await viewModel.load()
        #expect(viewModel.isEmpty)
        #expect(viewModel.selectedID == nil)
    }

    @Test("A new trend is saved, added to the list, selected and charted")
    func newTrend() async throws {
        let (viewModel, api) = make()
        await viewModel.load()
        viewModel.startNewTrend()
        let editor = try #require(viewModel.newTrend)
        editor.name = "Store again"
        editor.merchant = "corner store"
        #expect(await editor.save())
        #expect(api.with { $0.trendDrafts.last }
            == SavedTrendDraft(name: "Store again", matchType: .merchant, merchantID: "m-store", measure: .amount))
        #expect(viewModel.trends.count == 3)
        #expect(viewModel.selectedID == "trend-Store again")
        #expect(viewModel.selectedBuckets?.count == 12)
    }
}

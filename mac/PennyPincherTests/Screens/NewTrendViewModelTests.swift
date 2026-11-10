import Foundation
import Testing
@testable import PennyPincher

@MainActor
@Suite("New trend sheet")
struct NewTrendViewModelTests {
    private func make(_ change: (inout FakeLedgerAPI.State) -> Void = { _ in }) -> (NewTrendViewModel, FakeLedgerAPI, CreatedLog) {
        let api = Fixture.ledger(change)
        let created = CreatedLog()
        let viewModel = NewTrendViewModel(categories: Fixture.categories, merchants: [Fixture.cafe, Fixture.store],
                                          api: api, onCreated: { created.trends.append($0) })
        return (viewModel, api, created)
    }

    @Test("A name and a merchant are required; the merchant must be a known one")
    func validation() async {
        let (viewModel, api, _) = make()
        #expect(await !viewModel.save())
        #expect(viewModel.error(.name) == "Enter a name for the trend.")
        #expect(viewModel.error(.value) == "Choose a merchant.")
        viewModel.merchant = "Nowhere"
        #expect(viewModel.draft() == nil)
        #expect(viewModel.error(.value) == "No merchant has that name. Pick one from the suggestions.")
        #expect(api.calls.isEmpty)

        viewModel.matchType = .category
        #expect(viewModel.error(.value) == nil)
        #expect(viewModel.draft() == nil)
        #expect(viewModel.error(.value) == "Choose a category.")
        viewModel.matchType = .note
        viewModel.text = "   "
        #expect(viewModel.draft() == nil)
        #expect(viewModel.error(.value) == "Enter the text to look for.")
    }

    @Test("Only the field for the chosen match is sent, trimmed")
    func drafts() {
        let (viewModel, _, _) = make()
        viewModel.name = "  Cafe visits "
        viewModel.merchant = " CAFE "
        viewModel.categoryID = Fixture.food.id
        viewModel.text = "lunch"
        viewModel.measure = .count
        #expect(viewModel.draft() == SavedTrendDraft(name: "Cafe visits", matchType: .merchant, merchantID: "m-cafe",
                                                      measure: .count))
        viewModel.matchType = .category
        #expect(viewModel.draft() == SavedTrendDraft(name: "Cafe visits", matchType: .category, categoryID: "c-food",
                                                      measure: .count))
        viewModel.matchType = .note
        viewModel.text = " lunch "
        #expect(viewModel.draft() == SavedTrendDraft(name: "Cafe visits", matchType: .note, matchText: "lunch",
                                                      measure: .count))
    }

    @Test("Saving creates the trend and hands it back")
    func save() async {
        let (viewModel, api, created) = make()
        viewModel.name = "Cafe"
        viewModel.merchant = "Cafe"
        #expect(await viewModel.save())
        #expect(api.calls == ["createSavedTrend:Cafe"])
        #expect(created.trends.map(\.name) == ["Cafe"])
    }

    @Test("A name already in use shows on the name field")
    func nameTaken() async {
        let existing = SavedTrend(id: "t", name: "Cafe", matchType: .note, merchantID: nil, categoryID: nil,
                                  matchText: "x", measure: .amount, sortOrder: 0)
        let (viewModel, _, created) = make { $0.savedTrends = [existing] }
        viewModel.name = "cafe"
        viewModel.merchant = "Cafe"
        #expect(await !viewModel.save())
        #expect(viewModel.error(.name) == "A trend with this name already exists.")
        #expect(viewModel.errorMessage == nil)
        #expect(created.trends.isEmpty)
    }

    @Test("Merchant suggestions match what's typed, case-insensitively")
    func suggestions() {
        let (viewModel, _, _) = make()
        #expect(viewModel.merchantSuggestions.count == 2)
        viewModel.merchant = "co"
        #expect(viewModel.merchantSuggestions == [Fixture.store])
    }
}

/// The trends a sheet handed back.
@MainActor
final class CreatedLog {
    var trends: [SavedTrend] = []
}

import Foundation
import Testing
@testable import PennyPincher

@MainActor
@Suite("Categories & sources view model")
struct CategoriesViewModelTests {
    let api = Fixture.ledger { state in
        state.categoryStats = [
            CategoryStats(categoryID: Fixture.food.id, entryCount: 12, totalCents: 34_500, yearTotalCents: 20_000),
        ]
        state.sourceStats = [
            IncomeSourceStats(incomeSourceID: Fixture.job.id, entryCount: 4, yearGrossCents: 400_000,
                              yearGrossTaxableCents: 2_000, yearNetCents: 1_532),
        ]
    }

    private func loaded() async -> CategoriesViewModel {
        let viewModel = CategoriesViewModel(api: api, today: "2026-10-14")
        await viewModel.load()
        return viewModel
    }

    @Test("Loads both lists with year-to-date money and all-time entries")
    func rows() async {
        let viewModel = await loaded()
        #expect(viewModel.phase == .loaded)
        #expect(api.calls.contains("categoryStats:2026"))
        #expect(viewModel.eyebrow.hasPrefix("2026"))

        let food = viewModel.categoryRows[1]
        #expect(food.columns == ["12", "$200.00"])
        #expect(viewModel.categoryRows[0].badges == [.saving])
        let other = viewModel.categoryRows[3]
        #expect(other.isLocked && !other.canDelete && other.badges == [.locked])
        #expect(!viewModel.categoryRows[0].canMoveUp && viewModel.categoryRows[2].canMoveUp)
        #expect(!viewModel.categoryRows[2].canMoveDown)

        let job = viewModel.sourceRows[0]
        #expect(job.columns == ["4", "$4,000.00", "$15.32", "23.4%"])
        #expect(!job.canDelete && job.deleteHelp != nil)
        #expect(viewModel.sourceRows[1].canDelete)
        #expect(viewModel.sourceRows[2].isLocked && !viewModel.sourceRows[2].canDelete)
    }

    @Test("A failed load shows the error")
    func loadFails() async {
        api.with { $0.failures["categories"] = .network() }
        let viewModel = await loaded()
        #expect(viewModel.phase.errorMessage == APIError.network().message)
    }

    @Test("Renames inline; Other can't be renamed; errors stay on the field")
    func rename() async {
        let viewModel = await loaded()
        viewModel.beginRename(.category, Fixture.other.id)
        #expect(viewModel.renaming == nil)

        viewModel.beginRename(.category, Fixture.food.id)
        #expect(viewModel.renameText == "Food")
        viewModel.renameText = "  "
        await viewModel.commitRename()
        #expect(viewModel.renameError == "Enter a name.")

        api.with { $0.failures["renameCategory:c-food:Fun"] = APIError(code: "name_taken", status: 409, message: "Taken") }
        viewModel.renameText = "Fun"
        await viewModel.commitRename()
        #expect(viewModel.renameError == "Taken")
        #expect(viewModel.isRenaming(.category, Fixture.food.id))

        viewModel.renameText = " Groceries "
        await viewModel.commitRename()
        #expect(viewModel.renaming == nil)
        #expect(viewModel.categories[1].name == "Groceries")
    }

    @Test("Deleting a category says how many expenses move to Other")
    func deleteCategory() async throws {
        let viewModel = await loaded()
        viewModel.requestDelete(.category, Fixture.other.id)
        #expect(viewModel.pendingDelete == nil)

        viewModel.requestDelete(.category, Fixture.food.id)
        let request = try #require(viewModel.pendingDelete)
        #expect(request.message == "12 expenses ($345.00) move to Other. Templates that use it switch to Other.")
        #expect(request.confirmTitle == "Delete and move to Other")

        await viewModel.confirmDelete()
        #expect(api.calls.contains("deleteCategory:c-food"))
        #expect(viewModel.statusMessage == "Category deleted. 12 entries moved to Other.")
        #expect(!viewModel.categories.contains(Fixture.food))
    }

    @Test("Only a source with no entries can be deleted")
    func deleteSource() async {
        let viewModel = await loaded()
        viewModel.requestDelete(.source, Fixture.job.id)
        #expect(viewModel.pendingDelete == nil)
        viewModel.requestDelete(.source, Fixture.otherSource.id)
        #expect(viewModel.pendingDelete == nil)
        viewModel.requestDelete(.source, Fixture.gig.id)
        #expect(viewModel.pendingDelete?.confirmTitle == "Delete source")
        await viewModel.confirmDelete()
        #expect(api.calls.contains("deleteIncomeSource:s-gig"))
    }

    @Test("Reordering keeps Other in place and saves the whole order")
    func reorder() async {
        let viewModel = await loaded()
        // Drag Saving below Other: it lands last among the movable rows, Other stays last.
        await viewModel.move(.category, from: IndexSet(integer: 0), to: 4)
        #expect(api.with { $0.reorders.last } == ["c-food", "c-fun", "c-saving", "c-other"])

        await viewModel.move(.category, "c-saving", by: -1)
        #expect(viewModel.categories.map(\.id) == ["c-food", "c-saving", "c-fun", "c-other"])

        // Moving past the ends does nothing.
        let calls = api.calls.count
        await viewModel.move(.category, "c-food", by: -1)
        #expect(api.calls.count == calls)
    }

    @Test("A failed reorder puts the old order back")
    func reorderFails() async {
        let viewModel = await loaded()
        api.with { $0.failures["reorderIncomeSources"] = .network() }
        await viewModel.move(.source, Fixture.job.id, by: 1)
        #expect(viewModel.sources.map(\.id) == ["s-job", "s-gig", "s-other"])
        #expect(viewModel.errorMessage == APIError.network().message)
    }

    @Test("Adds a category and a source")
    func add() async {
        let viewModel = await loaded()
        await viewModel.addCategory()
        #expect(viewModel.addCategoryError == "Enter a name.")
        viewModel.newCategoryName = " Pets "
        await viewModel.addCategory()
        #expect(api.calls.contains("createCategory:Pets"))
        #expect(viewModel.newCategoryName.isEmpty)

        viewModel.newSourceName = String(repeating: "x", count: 101)
        await viewModel.addSource()
        #expect(viewModel.addSourceError == "Keep it under 100 characters.")
    }

    @Test("Reorder helper", arguments: [
        (["a", "b", "c"], "a", 2, ["b", "c", "a", "o"] as [String]?),
        (["a", "b", "c"], "c", 0, ["c", "a", "b", "o"]),
        (["a", "b", "c"], "b", 1, nil),
        (["a", "b", "c"], "b", 3, nil),
    ])
    func reorderHelper(ids: [String], id: String, to: Int, expected: [String]?) {
        let items = ids.map { Reorder.Item(id: $0, locked: false) } + [Reorder.Item(id: "o", locked: true)]
        #expect(Reorder.move(items, id: id, toUnlockedIndex: to) == expected)
    }
}

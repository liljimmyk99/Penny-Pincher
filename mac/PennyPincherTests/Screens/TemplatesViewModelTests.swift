import Foundation
import Testing
@testable import PennyPincher

@MainActor
@Suite("Templates view model")
struct TemplatesViewModelTests {
    let api = Fixture.ledger { state in
        state.templates = [Fixture.template("b", name: "Beta"), Fixture.template("a", name: "Alpha", days: [5])]
    }

    private func loaded() async -> TemplatesViewModel {
        let viewModel = TemplatesViewModel(api: api, month: "2026-11")
        await viewModel.load()
        return viewModel
    }

    @Test("Loads the list by name and opens the first template")
    func load() async {
        let viewModel = await loaded()
        #expect(viewModel.listRows.map(\.name) == ["Alpha", "Beta"])
        #expect(viewModel.selection == "a")
        #expect(viewModel.selected?.name == "Alpha")
        #expect(viewModel.title == "Alpha")
        #expect(viewModel.itemCountText == "1 bills · 1 paychecks")
    }

    @Test("Choosing another template loads its items")
    func select() async {
        let viewModel = await loaded()
        viewModel.selection = "b"
        await viewModel.selectionChanged()
        #expect(viewModel.selected?.id == "b")
        #expect(viewModel.categoryGroups.first { $0.id == Fixture.food.id }?.rows.count == 2)
    }

    @Test("Income rows carry the label, tax rate and an All sources line")
    func incomeRows() async {
        let viewModel = await loaded()
        let row = viewModel.incomeRows.first
        #expect(row?.source == "Job" && row?.label == "Paycheck" && row?.dayText == "15")
        #expect(row?.netText == "$2,000.00")
        #expect(row?.taxRateText == "25.9%")
        #expect(viewModel.incomeTotal?.source == "All sources")
    }

    @Test("Expense items group under every category in order, empty ones included; Saving is flagged")
    func groups() async {
        let viewModel = await loaded()
        let groups = viewModel.categoryGroups
        #expect(groups.map(\.name) == ["Saving", "Food", "Fun", "Other"])
        #expect(groups[0].isSaving)
        #expect(groups[1].rows.map(\.title) == ["Corner Store"])
        #expect(groups[1].totalText == "$100.00")
        #expect(groups[2].rows.isEmpty)
    }

    @Test("Tiles are summed from the items; Saving counts as spending with the saved part noted")
    func totals() async {
        api.with { state in
            state.templates[state.templates.firstIndex { $0.id == "a" }!].expenseItems.append(
                TemplateExpenseItem(id: "s", categoryID: Fixture.saving.id, merchant: Fixture.cafe, dayOfMonth: 2,
                                    amountCents: 5_000, note: "Transfer", sortOrder: 9))
        }
        let viewModel = await loaded()
        let totals = viewModel.totals
        #expect(totals?.netIncomeCents == 200_000)
        #expect(totals?.spendingCents == 15_000)
        #expect(totals?.savedCents == 5_000)
        #expect(totals?.leftOverCents == 185_000)
        #expect(viewModel.categoryGroups[0].rows.map(\.title) == ["Cafe · Transfer"])
    }

    @Test("Creating a template selects it; a blank or duplicate name shows an error")
    func create() async {
        let viewModel = await loaded()
        viewModel.newName = "  "
        await viewModel.createTemplate()
        #expect(viewModel.newNameError == "Enter a name.")
        viewModel.newName = " Gamma "
        await viewModel.createTemplate()
        #expect(api.calls.contains("createTemplate:Gamma"))
        #expect(viewModel.selected?.name == "Gamma")
        #expect(viewModel.newName.isEmpty)
        #expect(viewModel.listRows.map(\.name).contains("Gamma"))

        api.with { $0.failures["createTemplate:Alpha"] = APIError.code("name_taken", status: 409) }
        viewModel.newName = "Alpha"
        await viewModel.createTemplate()
        #expect(viewModel.newNameError == "You already have a template with that name.")
    }

    @Test("Rename and delete")
    func renameDelete() async {
        let viewModel = await loaded()
        viewModel.beginRename()
        #expect(viewModel.isRenaming && viewModel.renameText == "Alpha")
        viewModel.renameText = "Primary"
        await viewModel.commitRename()
        #expect(viewModel.selected?.name == "Primary")
        #expect(viewModel.statusMessage == "Template renamed.")

        viewModel.requestDeleteTemplate()
        #expect(viewModel.pendingDelete?.message == "Entries already copied into months stay.")
        await viewModel.confirmDelete()
        #expect(api.calls.contains("deleteTemplate:a"))
        #expect(viewModel.selection == "b")
        #expect(viewModel.listRows.map(\.id) == ["b"])
    }

    @Test("Adding an expense item validates, then saves and refreshes the counts")
    func addExpense() async throws {
        let viewModel = await loaded()
        viewModel.addExpenseItem(in: Fixture.fun.id)
        let editor = try #require(viewModel.expenseEditor)
        #expect(editor.categoryID == Fixture.fun.id)
        #expect(await editor.save() == false)
        #expect(editor.errors[.merchant] != nil && editor.errors[.amount] != nil)

        editor.merchant = " Cinema "
        editor.amount = "12.50"
        editor.day = "32"
        #expect(await editor.save() == false)
        #expect(editor.errors[.day] != nil)
        editor.day = "31"
        #expect(await editor.save())
        #expect(api.with { $0.templateDrafts.last } == TemplateExpenseItemDraft(
            categoryID: Fixture.fun.id, merchantName: "Cinema", dayOfMonth: 31, amountCents: 1_250, note: nil))
        #expect(viewModel.selected?.expenseItems.count == 2)
        #expect(viewModel.listRows.first?.expenseItemCount == 2)
    }

    @Test("Editing an expense item sends the draft; amounts must be above zero")
    func editExpense() async throws {
        let viewModel = await loaded()
        viewModel.editExpenseItem("e0")
        let editor = try #require(viewModel.expenseEditor)
        #expect(editor.merchant == "Corner Store" && editor.day == "5" && editor.amount == "100.00")
        editor.amount = "0"
        #expect(await editor.save() == false)
        #expect(editor.errors[.amount] == "Enter an amount above zero.")
        editor.amount = "99.99"
        editor.note = "Weekly"
        #expect(await editor.save())
        #expect(viewModel.selected?.expenseItems.first?.amountCents == 9_999)
        #expect(viewModel.categoryGroups[1].rows.first?.title == "Corner Store · Weekly")
    }

    @Test("Income items need taxable and net at most gross")
    func incomeItem() async throws {
        let viewModel = await loaded()
        viewModel.addIncomeItem()
        let editor = try #require(viewModel.incomeEditor)
        editor.sourceID = Fixture.gig.id
        editor.gross = "100"
        editor.taxable = "150"
        editor.net = "120"
        editor.day = "10"
        #expect(await editor.save() == false)
        #expect(editor.errors[.taxable] != nil && editor.errors[.net] != nil)
        editor.taxable = "90"
        editor.net = "70"
        editor.label = "Gig"
        #expect(await editor.save())
        #expect(api.with { $0.templateIncomeDrafts.last } == TemplateIncomeItemDraft(
            incomeSourceID: Fixture.gig.id, dayOfMonth: 10, grossCents: 10_000, grossTaxableCents: 9_000,
            netCents: 7_000, note: "Gig"))
        #expect(viewModel.incomeRows.count == 2)
    }

    @Test("Removing an item asks first")
    func removeItem() async {
        let viewModel = await loaded()
        viewModel.requestRemoveExpenseItem("e0")
        #expect(viewModel.pendingDelete?.confirmTitle == "Remove item")
        await viewModel.confirmDelete()
        #expect(api.calls.contains("deleteExpenseItem:e0"))
        #expect(viewModel.selected?.expenseItems.isEmpty == true)
        viewModel.requestRemoveIncomeItem("i0")
        await viewModel.confirmDelete()
        #expect(api.calls.contains("deleteIncomeItem:i0"))
        #expect(viewModel.incomeRows.isEmpty)
    }

    @Test("Apply goes to the chosen month; a month with data confirms the reset first")
    func apply() async {
        api.with { $0.expenses = [Fixture.expense("old", "2026-12-03", 500)] }
        let viewModel = await loaded()
        viewModel.beginApply()
        #expect(viewModel.showsApplySheet)
        viewModel.applyMonth.next()
        #expect(viewModel.applyTitle == "Apply to December 2026")
        await viewModel.apply()
        #expect(viewModel.showsApplySheet, "the sheet stays for the reset confirmation")
        #expect(viewModel.applier.pendingReset?.message.contains("1 expenses and 0 income entries") == true)
        await viewModel.confirmApplyReset()
        #expect(!viewModel.showsApplySheet)
        #expect(api.with { $0.applyRequests.map(\.month) } == ["2026-12", "2026-12"])
        #expect(viewModel.noticeMessage?.contains("existing entries were deleted") == true)
    }

    @Test("Applying to an empty month closes the sheet")
    func applyEmpty() async {
        let viewModel = await loaded()
        viewModel.beginApply()
        await viewModel.apply()
        #expect(!viewModel.showsApplySheet)
        #expect(api.with { $0.applyRequests.map(\.reset) } == [false])
    }

    @Test("A failed load shows the error and blocks editing")
    func failed() async {
        api.with { $0.failures["templates"] = APIError.network() }
        let viewModel = TemplatesViewModel(api: api, month: "2026-11")
        await viewModel.load()
        #expect(viewModel.phase.errorMessage != nil)
        viewModel.addIncomeItem()
        #expect(viewModel.incomeEditor == nil)
    }
}

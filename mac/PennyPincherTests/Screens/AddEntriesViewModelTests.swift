import Foundation
import Testing
@testable import PennyPincher

@MainActor
@Suite("Add entries view model")
struct AddEntriesViewModelTests {
    let api = Fixture.ledger { state in
        state.merchants = [Fixture.store, Fixture.cafe]
        state.expenses = [
            Fixture.expense("old", "2026-09-30", 4_000, category: Fixture.fun.id),
            Fixture.expense("older", "2026-08-01", 2_000),
        ]
        state.income = [Fixture.income("i1", "2026-10-01", net: 70_000)]
    }
    let month = MonthSelection(month: "2026-10")

    private func loaded() async -> AddEntriesViewModel {
        let viewModel = AddEntriesViewModel(api: api, month: month, today: { "2026-10-14" }, searchDelay: .zero)
        await viewModel.load()
        return viewModel
    }

    @Test("Starts with one row dated today and the month's income")
    func start() async {
        let viewModel = await loaded()
        #expect(viewModel.rows.count == 1)
        #expect(viewModel.rows[0].date == "2026-10-14")
        #expect(viewModel.income.sourceID == Fixture.job.id)
        #expect(viewModel.incomeTotalText == "$700.00")
    }

    @Test("Return moves to the next row, adding one that copies the date")
    func returnAddsRow() async {
        let viewModel = await loaded()
        let first = viewModel.rows[0].id
        viewModel.rows[0].date = "2026-10-03"
        let next = viewModel.rowAfter(first)
        #expect(viewModel.rows.count == 2)
        #expect(viewModel.rows[1].id == next)
        #expect(viewModel.rows[1].date == "2026-10-03")
        #expect(viewModel.rowAfter(first) == next)
        #expect(viewModel.rows.count == 2)

        viewModel.removeRow(next)
        viewModel.removeRow(first)
        #expect(viewModel.rows.count == 1)
        #expect(!viewModel.canRemoveRows)
    }

    @Test("Row rules", arguments: [
        ("12.5", false, 1_250), ("-24.99", false, -2_499), ("24.99", true, -2_499), ("-3", true, -300),
    ])
    func cents(amount: String, refund: Bool, expected: Int) {
        var row = ExpenseRow(date: "2026-10-01", refund: refund)
        row.amount = amount
        #expect(row.cents == expected)
        #expect(row.isRefund == (expected < 0))
    }

    @Test("Validates rows before saving and skips blank ones")
    func validate() async throws {
        let viewModel = await loaded()
        await viewModel.saveExpenses()
        #expect(viewModel.batchError == "Add at least one expense first.")

        viewModel.rows[0].merchant = "Cafe"
        viewModel.rows[0].amount = "0"
        await viewModel.saveExpenses()
        let errors = viewModel.errors(for: viewModel.rows[0].id)
        #expect(errors[.category] == "Choose a category.")
        #expect(errors[.amount] == "The amount can’t be zero.")
        #expect(!api.calls.contains("createExpenses"))
    }

    @Test("Saves every filled row in one batch, refunds negative and linked")
    func save() async throws {
        let viewModel = await loaded()
        viewModel.rows[0].merchant = " Cafe "
        viewModel.setCategory(viewModel.rows[0].id, Fixture.food.id)
        viewModel.rows[0].amount = "4.50"
        viewModel.rows[0].note = "  "
        let blank = viewModel.addRow()
        let refund = viewModel.addRow(refund: true)
        _ = blank
        let index = viewModel.rows.firstIndex { $0.id == refund }!
        viewModel.rows[index].merchant = "Corner Store"
        viewModel.rows[index].merchantID = Fixture.store.id
        viewModel.rows[index].categoryID = Fixture.food.id
        viewModel.rows[index].amount = "10"
        viewModel.rows[index].refundedExpenseID = "old"

        await viewModel.saveExpenses()
        let sent = try #require(api.with { $0.createdDrafts.first })
        #expect(sent == [
            ExpenseDraft(date: "2026-10-14", amountCents: 450, categoryID: "c-food", merchantName: "Cafe", note: nil,
                         refundedExpenseID: nil),
            ExpenseDraft(date: "2026-10-14", amountCents: -1_000, categoryID: "c-food", merchantName: "Corner Store",
                         note: nil, refundedExpenseID: "old"),
        ])
        #expect(viewModel.statusMessage == "Saved 2 expenses.")
        #expect(viewModel.rows.count == 1 && viewModel.rows[0].isBlank)
    }

    @Test("Batch errors land on the rows that were sent")
    func batchErrors() async {
        let viewModel = await loaded()
        viewModel.rows[0].merchant = "Cafe"
        viewModel.rows[0].categoryID = Fixture.food.id
        viewModel.rows[0].amount = "1"
        api.with {
            $0.failures["createExpenses"] = APIError(code: "invalid_request", status: 400, message: "Bad", details: [
                .init(field: "items[0].amount_cents", issue: "too large"),
                .init(field: "items", issue: "something else"),
            ])
        }
        await viewModel.saveExpenses()
        #expect(viewModel.errors(for: viewModel.rows[0].id)[.amount] == "too large")
        #expect(viewModel.batchError == "something else")
        #expect(viewModel.rows[0].merchant == "Cafe")
    }

    @Test("A known merchant fills in its latest category unless one was chosen")
    func merchantPrefill() async {
        let viewModel = await loaded()
        let id = viewModel.rows[0].id
        viewModel.rows[0].merchant = "corner store"
        viewModel.merchantChanged(id)
        await settle()
        #expect(viewModel.suggestions[id] == [Fixture.store])
        #expect(viewModel.rows[0].merchantID == Fixture.store.id)
        #expect(viewModel.rows[0].categoryID == Fixture.fun.id)

        let second = viewModel.addRow()
        viewModel.setCategory(second, Fixture.saving.id)
        let index = viewModel.rows.firstIndex { $0.id == second }!
        viewModel.rows[index].merchant = "Corner Store"
        viewModel.merchantChanged(second)
        await settle()
        #expect(viewModel.rows[index].categoryID == Fixture.saving.id)

        viewModel.rows[index].merchant = "Corner"
        viewModel.merchantChanged(second)
        await settle()
        #expect(viewModel.rows[index].merchantID == nil)
    }

    @Test("A refund row lists the merchant's past expenses, and picking one sets its category")
    func refundLink() async {
        let viewModel = await loaded()
        let id = viewModel.addRow(refund: true)
        let index = viewModel.rows.firstIndex { $0.id == id }!
        viewModel.rows[index].merchant = "Corner Store"
        viewModel.merchantChanged(id)
        await settle()
        #expect(viewModel.refundCandidates[id]?.map(\.id) == ["old", "older"])
        viewModel.setRefundLink(id, "older")
        #expect(viewModel.rows[index].refundedExpenseID == "older")
        #expect(viewModel.rows[index].categoryID == Fixture.food.id)
        viewModel.setRefundLink(id, nil)
        #expect(viewModel.rows[index].refundedExpenseID == nil)
    }

    @Test("Adds income and checks taxable and net against gross")
    func income() async throws {
        let viewModel = await loaded()
        viewModel.income.gross = "1000"
        viewModel.income.taxable = "1200"
        viewModel.income.net = "800"
        await viewModel.saveIncome()
        #expect(viewModel.incomeError(.taxable) == "Gross taxable can’t be more than gross.")

        viewModel.income.taxable = "900"
        viewModel.income.label = " Bonus "
        await viewModel.saveIncome()
        let draft = try #require(api.with { $0.incomeDrafts.first })
        #expect(draft == IncomeEntryDraft(date: "2026-10-14", incomeSourceID: "s-job", grossCents: 100_000,
                                          grossTaxableCents: 90_000, netCents: 80_000, note: "Bonus"))
        #expect(viewModel.incomeEntries.count == 2)
        #expect(viewModel.income.gross.isEmpty && viewModel.income.sourceID == "s-job")
        #expect(viewModel.statusMessage == "Income added.")
    }

    @Test("Changing month moves blank rows and reloads income")
    func monthChange() async {
        let viewModel = await loaded()
        month.previous()
        await viewModel.monthChanged()
        #expect(viewModel.rows[0].date == "2026-09-01")
        #expect(viewModel.income.date == "2026-09-01")
        #expect(viewModel.incomeEntries.isEmpty)
        #expect(api.calls.contains("incomeEntries:2026-09"))
    }
}

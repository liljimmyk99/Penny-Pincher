import Foundation
import Testing
@testable import PennyPincher

@MainActor
@Suite("Transactions view model")
struct TransactionsViewModelTests {
    let api = Fixture.ledger { state in
        state.expenses = [
            Fixture.expense("sept", "2026-09-20", 6_000),
            Fixture.expense("groceries", "2026-10-03", 5_000, note: "weekly", refundedTotal: -5_000, lastRefund: "2026-10-09"),
            Fixture.expense("full", "2026-10-09", -5_000, refunds: "groceries"),
            Fixture.expense("late", "2026-10-11", -1_000, refunds: "sept"),
            Fixture.expense("loose", "2026-10-12", -700, merchant: Fixture.cafe),
            Fixture.expense("save", "2026-10-01", 20_000, category: Fixture.saving.id, merchant: Fixture.cafe,
                            confirmed: false),
        ]
        state.income = [Fixture.income("pay", "2026-10-15", gross: 300_000, taxable: 2_000, net: 1_532,
                                       note: "Paycheck", confirmed: false)]
    }
    let month = MonthSelection(month: "2026-10")

    private func loaded() async -> TransactionsViewModel {
        let viewModel = TransactionsViewModel(api: api, month: month)
        await viewModel.load()
        return viewModel
    }

    private func row(_ viewModel: TransactionsViewModel, _ id: String) -> TransactionRow? {
        viewModel.rows.first { $0.id == id }
    }

    @Test("Rows carry refund tags, links and original states")
    func rows() async throws {
        let viewModel = await loaded()
        #expect(viewModel.rows.map(\.id) == ["loose", "late", "full", "groceries", "save"])
        #expect(api.calls.contains("expense:sept"))

        let full = try #require(row(viewModel, "full"))
        #expect(full.tag == .full)
        #expect(full.refundForText == "Refund for Corner Store · Oct 3 · $50.00")
        #expect(!full.canLink)
        #expect(row(viewModel, "late")?.tag == .earlier("September"))
        let loose = try #require(row(viewModel, "loose"))
        #expect(loose.tag == .unlinked && loose.canLink)
        let groceries = try #require(row(viewModel, "groceries"))
        #expect(groceries.originalStatus?.full == true)
        #expect(groceries.tag == nil)
        #expect(row(viewModel, "save")?.isUnconfirmed == true)
    }

    @Test("Filters by category, refunds and search; sorts by amount")
    func filters() async {
        let viewModel = await loaded()
        viewModel.toggleCategory(Fixture.saving.id)
        #expect(viewModel.rows.map(\.id) == ["save"])
        viewModel.toggleCategory(Fixture.saving.id)
        #expect(viewModel.categoryFilter == nil)

        viewModel.refundFilter = .refunds
        #expect(viewModel.rows.map(\.id) == ["loose", "late", "full"])
        viewModel.refundFilter = .unlinked
        #expect(viewModel.rows.map(\.id) == ["loose"])
        viewModel.refundFilter = nil

        viewModel.search = "WEEK"
        #expect(viewModel.rows.map(\.id) == ["groceries"])
        viewModel.search = ""
        #expect(viewModel.emptyMessage == "transactions.empty.filtered" || !viewModel.rows.isEmpty)

        viewModel.sortOrder = [KeyPathComparator(\.amountCents)]
        #expect(viewModel.rows.first?.id == "full")
        #expect(viewModel.rows.last?.id == "save")
    }

    @Test("Category chips: counts, totals after refunds and share; Saving flagged")
    func chips() async throws {
        let viewModel = await loaded()
        let chips = viewModel.categoryChips
        #expect(chips.map(\.id) == [Fixture.saving.id, Fixture.food.id])
        let food = try #require(chips.last)
        #expect(food.count == 4)
        #expect(food.totalText == Money.format(-1_700))
        #expect(food.barFraction == 0)
        #expect(chips[0].isSaving && chips[0].shareText == "109%")
        #expect(TransactionsViewModel.share(1, of: 3) == "33%")
        #expect(TransactionsViewModel.share(5, of: 0) == "—")
    }

    @Test("Tiles, income rows and totals")
    func tiles() async {
        let viewModel = await loaded()
        #expect(viewModel.refundTiles == RefundTiles(refundsText: "−$67.00", refundsDetail: "3 refunds · 2 linked",
                                                     beforeText: "$250.00", afterText: "$183.00"))
        #expect(viewModel.incomeRows.first?.taxRateText == "23.4%")
        #expect(viewModel.incomeRows.first?.isUnconfirmed == true)
        #expect(viewModel.incomeTotal.netText == "$15.32")
        #expect(viewModel.unconfirmedCount == 2)
    }

    @Test("Confirm one, or confirm all as-is")
    func confirm() async {
        let viewModel = await loaded()
        await viewModel.confirmExpense("save")
        #expect(api.with { $0.expenseChanges.last?.1 } == ExpenseChanges(confirmed: true))
        #expect(viewModel.unconfirmedCount == 1)
        await viewModel.confirmAll()
        #expect(api.calls.contains("confirmAll:2026-10"))
        #expect(viewModel.unconfirmedCount == 0)
    }

    @Test("Deleting an expense with refunds says they stay")
    func delete() async throws {
        let viewModel = await loaded()
        viewModel.requestDeleteExpense("groceries")
        #expect(viewModel.pendingDelete?.message == "Its refunds stay, unlinked. This can’t be undone.")
        await viewModel.confirmDelete()
        #expect(api.calls.contains("deleteExpense:groceries"))
        #expect(viewModel.statusMessage == "Deleted.")

        viewModel.requestDeleteIncome("pay")
        #expect(viewModel.pendingDelete?.kind == .income)
    }

    @Test("Edit sends only the changed fields")
    func edit() async throws {
        let viewModel = await loaded()
        viewModel.editExpense("groceries")
        let editor = try #require(viewModel.expenseEditor)
        #expect(editor.amount == "50.00")
        #expect(await editor.save())
        #expect(api.with { $0.expenseChanges }.isEmpty)

        editor.amount = "-50"
        editor.note = ""
        #expect(editor.isRefund)
        #expect(editor.changes == ExpenseChanges(amountCents: -5_000, note: ""))
        api.with { $0.failures["updateExpense:groceries"] = APIError(code: "has_linked_refunds", status: 409, message: "Has refunds") }
        #expect(await editor.save() == false)
        #expect(editor.errorMessage == "Has refunds")

        editor.merchant = ""
        #expect(await editor.save() == false)
        #expect(editor.error(.merchant) == "Enter a merchant.")
    }

    @Test("Income edit sends only the changed fields")
    func editIncome() async throws {
        let viewModel = await loaded()
        viewModel.editIncome("pay")
        let editor = try #require(viewModel.incomeEditor)
        editor.form.net = "15.00"
        #expect(editor.changes == IncomeEntryChanges(netCents: 1_500))
        #expect(await editor.save())
        #expect(api.with { $0.incomeChanges.first?.0 } == "pay")
        #expect(viewModel.statusMessage == "Changes saved.")
    }

    @Test("Link… suggests a match and links only the refund id")
    func link() async throws {
        api.with { $0.expenses.append(Fixture.expense("cafeLunch", "2026-10-10", 900, merchant: Fixture.cafe, note: "lunch")) }
        let viewModel = await loaded()
        viewModel.linkRefund("full")
        #expect(viewModel.linker?.refund.id == "full")
        viewModel.linkRefund("loose")
        let linker = try #require(viewModel.linker)
        await linker.load()
        let query = try #require(api.with { $0.queries.last })
        #expect(query == ExpenseQuery(from: "2026-07-14", to: "2026-10-12", kind: .expense))
        #expect(linker.suggested?.id == "cafeLunch")
        #expect(linker.selectedID == "cafeLunch")
        #expect(linker.visible.first?.id == "cafeLunch")
        linker.search = "corner"
        #expect(linker.visible.allSatisfy { $0.merchant == Fixture.store })

        #expect(await linker.link())
        #expect(api.with { $0.expenseChanges.last?.1 } == ExpenseChanges(refundedExpenseID: "cafeLunch"))
        #expect(viewModel.statusMessage == "Refund linked.")
        #expect(row(viewModel, "loose")?.tag == .partial)
    }

    @Test("Refund for … selects the original, switching to its month")
    func showOriginal() async {
        let viewModel = await loaded()
        viewModel.search = "zzz"
        viewModel.showOriginal("full")
        #expect(viewModel.selection == ["groceries"])
        #expect(viewModel.search.isEmpty)

        viewModel.showOriginal("late")
        #expect(month.month == "2026-09")
        await viewModel.monthChanged()
        #expect(viewModel.selection == ["sept"])
    }
}

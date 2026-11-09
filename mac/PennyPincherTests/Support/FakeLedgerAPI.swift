import Foundation
@testable import PennyPincher

/// An in-memory `LedgerAPI` for view-model tests: scripted data, scripted
/// failures by call name, and a log of every call.
final class FakeLedgerAPI: LedgerAPI, @unchecked Sendable {
    private let lock = NSLock()
    private var state = State()

    struct State {
        var categories: [ExpenseCategory] = []
        var categoryStats: [CategoryStats] = []
        var sources: [IncomeSource] = []
        var sourceStats: [IncomeSourceStats] = []
        var merchants: [Merchant] = []
        var expenses: [Expense] = []
        var income: [IncomeEntry] = []
        var failures: [String: APIError] = [:]
        var calls: [String] = []
        var createdDrafts: [[ExpenseDraft]] = []
        var expenseChanges: [(String, ExpenseChanges)] = []
        var incomeChanges: [(String, IncomeEntryChanges)] = []
        var incomeDrafts: [IncomeEntryDraft] = []
        var queries: [ExpenseQuery] = []
        var reorders: [[String]] = []
    }

    func with<T>(_ body: (inout State) -> T) -> T { lock.withLock { body(&state) } }

    var calls: [String] { with { $0.calls } }

    private func record(_ call: String) throws(APIError) {
        let failure: APIError? = with {
            $0.calls.append(call)
            return $0.failures[call]
        }
        if let failure { throw failure }
    }

    // MARK: Categories

    func categories() async throws(APIError) -> [ExpenseCategory] {
        try record("categories")
        return with { $0.categories }
    }

    func categoryStats(year: Int) async throws(APIError) -> [CategoryStats] {
        try record("categoryStats:\(year)")
        return with { $0.categoryStats }
    }

    func createCategory(name: String) async throws(APIError) -> ExpenseCategory {
        try record("createCategory:\(name)")
        return with { state in
            let category = ExpenseCategory(id: "new-\(name)", name: name, color: nil, isSaving: false,
                                           isProtected: false, sortOrder: state.categories.count)
            state.categories.insert(category, at: max(0, state.categories.count - 1))
            return category
        }
    }

    func renameCategory(id: String, name: String) async throws(APIError) -> ExpenseCategory {
        try record("renameCategory:\(id):\(name)")
        return with { state in
            let index = state.categories.firstIndex { $0.id == id }!
            state.categories[index].name = name
            return state.categories[index]
        }
    }

    func deleteCategory(id: String) async throws(APIError) {
        try record("deleteCategory:\(id)")
        with { $0.categories.removeAll { $0.id == id } }
    }

    func reorderCategories(ids: [String]) async throws(APIError) -> [ExpenseCategory] {
        try record("reorderCategories")
        return with { state in
            state.reorders.append(ids)
            state.categories = ids.compactMap { id in state.categories.first { $0.id == id } }
            return state.categories
        }
    }

    func incomeSources() async throws(APIError) -> [IncomeSource] {
        try record("incomeSources")
        return with { $0.sources }
    }

    func incomeSourceStats(year: Int) async throws(APIError) -> [IncomeSourceStats] {
        try record("incomeSourceStats:\(year)")
        return with { $0.sourceStats }
    }

    func createIncomeSource(name: String) async throws(APIError) -> IncomeSource {
        try record("createIncomeSource:\(name)")
        return IncomeSource(id: "new-\(name)", name: name, isProtected: false, hasEntries: false, sortOrder: 9)
    }

    func renameIncomeSource(id: String, name: String) async throws(APIError) -> IncomeSource {
        try record("renameIncomeSource:\(id):\(name)")
        return with { state in
            let index = state.sources.firstIndex { $0.id == id }!
            state.sources[index].name = name
            return state.sources[index]
        }
    }

    func deleteIncomeSource(id: String) async throws(APIError) {
        try record("deleteIncomeSource:\(id)")
        with { $0.sources.removeAll { $0.id == id } }
    }

    func reorderIncomeSources(ids: [String]) async throws(APIError) -> [IncomeSource] {
        try record("reorderIncomeSources")
        return with { state in
            state.reorders.append(ids)
            state.sources = ids.compactMap { id in state.sources.first { $0.id == id } }
            return state.sources
        }
    }

    // MARK: Entries

    func merchants(prefix: String) async throws(APIError) -> [Merchant] {
        try record("merchants:\(prefix)")
        return with { $0.merchants.filter { $0.name.lowercased().hasPrefix(prefix.lowercased()) } }
    }

    func expenses(_ query: ExpenseQuery) async throws(APIError) -> [Expense] {
        try record("expenses")
        return with { state in
            state.queries.append(query)
            var found = state.expenses.filter { expense in
                (query.month.map { CalendarDate.month(of: expense.date) == $0 } ?? true)
                    && (query.from.map { expense.date >= $0 } ?? true)
                    && (query.to.map { expense.date <= $0 } ?? true)
                    && (query.merchantID.map { expense.merchant.id == $0 } ?? true)
                    && (query.kind.map { ($0 == .refund) == expense.isRefund } ?? true)
            }
            found.sort { $0.date > $1.date }
            if let limit = query.limit { found = Array(found.prefix(limit)) }
            return found
        }
    }

    func expense(id: String) async throws(APIError) -> Expense {
        try record("expense:\(id)")
        guard let found = with({ $0.expenses.first { $0.id == id } }) else {
            throw APIError.code("not_found", status: 404)
        }
        return found
    }

    func createExpenses(_ drafts: [ExpenseDraft]) async throws(APIError) -> [Expense] {
        try record("createExpenses")
        return with { state in
            state.createdDrafts.append(drafts)
            return drafts.enumerated().map { index, draft in
                Expense(id: "created\(index)", date: draft.date, amountCents: draft.amountCents,
                        categoryID: draft.categoryID, merchant: Merchant(id: "m", name: draft.merchantName),
                        note: draft.note, refundedExpenseID: draft.refundedExpenseID, refundedTotalCents: 0,
                        lastRefundDate: nil, confirmed: true, templateApplyID: nil)
            }
        }
    }

    func updateExpense(id: String, _ changes: ExpenseChanges) async throws(APIError) -> Expense {
        try record("updateExpense:\(id)")
        return with { state in
            state.expenseChanges.append((id, changes))
            let index = state.expenses.firstIndex { $0.id == id }!
            if let confirmed = changes.confirmed { state.expenses[index].confirmed = confirmed }
            if let link = changes.refundedExpenseID { state.expenses[index].refundedExpenseID = link }
            return state.expenses[index]
        }
    }

    func deleteExpense(id: String) async throws(APIError) {
        try record("deleteExpense:\(id)")
        with { $0.expenses.removeAll { $0.id == id } }
    }

    func incomeEntries(month: String) async throws(APIError) -> [IncomeEntry] {
        try record("incomeEntries:\(month)")
        return with { $0.income.filter { CalendarDate.month(of: $0.date) == month } }
    }

    func createIncomeEntry(_ draft: IncomeEntryDraft) async throws(APIError) -> IncomeEntry {
        try record("createIncomeEntry")
        return with { state in
            state.incomeDrafts.append(draft)
            let entry = IncomeEntry(id: "income\(state.incomeDrafts.count)", date: draft.date,
                                    incomeSourceID: draft.incomeSourceID, grossCents: draft.grossCents,
                                    grossTaxableCents: draft.grossTaxableCents, netCents: draft.netCents,
                                    note: draft.note, confirmed: true, templateApplyID: nil)
            state.income.append(entry)
            return entry
        }
    }

    func updateIncomeEntry(id: String, _ changes: IncomeEntryChanges) async throws(APIError) -> IncomeEntry {
        try record("updateIncomeEntry:\(id)")
        return with { state in
            state.incomeChanges.append((id, changes))
            let index = state.income.firstIndex { $0.id == id }!
            if let confirmed = changes.confirmed { state.income[index].confirmed = confirmed }
            return state.income[index]
        }
    }

    func deleteIncomeEntry(id: String) async throws(APIError) {
        try record("deleteIncomeEntry:\(id)")
        with { $0.income.removeAll { $0.id == id } }
    }

    func confirmAll(month: String) async throws(APIError) {
        try record("confirmAll:\(month)")
        with { state in
            for index in state.expenses.indices where CalendarDate.month(of: state.expenses[index].date) == month {
                state.expenses[index].confirmed = true
            }
            for index in state.income.indices where CalendarDate.month(of: state.income[index].date) == month {
                state.income[index].confirmed = true
            }
        }
    }
}

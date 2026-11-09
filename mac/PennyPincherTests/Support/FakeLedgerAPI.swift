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
        var templates: [Template] = []
        var applies: [TemplateApply] = []
        var applyRequests: [(month: String, templateID: String, reset: Bool)] = []
        var templateDrafts: [TemplateExpenseItemDraft] = []
        var templateIncomeDrafts: [TemplateIncomeItemDraft] = []
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

    // MARK: Templates

    func templates() async throws(APIError) -> [TemplateSummary] {
        try record("templates")
        return with { state in
            state.templates.sorted { $0.name < $1.name }.map {
                TemplateSummary(id: $0.id, name: $0.name, expenseItemCount: $0.expenseItems.count,
                                incomeItemCount: $0.incomeItems.count)
            }
        }
    }

    func template(id: String) async throws(APIError) -> Template {
        try record("template:\(id)")
        guard let found = with({ $0.templates.first { $0.id == id } }) else { throw APIError.code("not_found", status: 404) }
        return found
    }

    func createTemplate(name: String) async throws(APIError) -> Template {
        try record("createTemplate:\(name)")
        return with { state in
            let template = Template(id: "t-\(name)", name: name, expenseItems: [], incomeItems: [])
            state.templates.append(template)
            return template
        }
    }

    func renameTemplate(id: String, name: String) async throws(APIError) -> Template {
        try record("renameTemplate:\(id):\(name)")
        return with { state in
            let index = state.templates.firstIndex { $0.id == id }!
            state.templates[index].name = name
            return state.templates[index]
        }
    }

    func deleteTemplate(id: String) async throws(APIError) {
        try record("deleteTemplate:\(id)")
        with { $0.templates.removeAll { $0.id == id } }
    }

    func createExpenseItem(templateID: String, _ draft: TemplateExpenseItemDraft) async throws(APIError) -> TemplateExpenseItem {
        try record("createExpenseItem:\(templateID)")
        return with { state in
            state.templateDrafts.append(draft)
            let index = state.templates.firstIndex { $0.id == templateID }!
            let item = TemplateExpenseItem(id: "ei\(state.templateDrafts.count)", categoryID: draft.categoryID,
                                           merchant: Merchant(id: "m", name: draft.merchantName),
                                           dayOfMonth: draft.dayOfMonth, amountCents: draft.amountCents,
                                           note: draft.note, sortOrder: state.templates[index].expenseItems.count)
            state.templates[index].expenseItems.append(item)
            return item
        }
    }

    func updateExpenseItem(templateID: String, itemID: String, _ draft: TemplateExpenseItemDraft) async throws(APIError) -> TemplateExpenseItem {
        try record("updateExpenseItem:\(itemID)")
        return with { state in
            state.templateDrafts.append(draft)
            let index = state.templates.firstIndex { $0.id == templateID }!
            let at = state.templates[index].expenseItems.firstIndex { $0.id == itemID }!
            state.templates[index].expenseItems[at].categoryID = draft.categoryID
            state.templates[index].expenseItems[at].merchant = Merchant(id: "m", name: draft.merchantName)
            state.templates[index].expenseItems[at].dayOfMonth = draft.dayOfMonth
            state.templates[index].expenseItems[at].amountCents = draft.amountCents
            state.templates[index].expenseItems[at].note = draft.note
            return state.templates[index].expenseItems[at]
        }
    }

    func deleteExpenseItem(templateID: String, itemID: String) async throws(APIError) {
        try record("deleteExpenseItem:\(itemID)")
        with { state in
            let index = state.templates.firstIndex { $0.id == templateID }!
            state.templates[index].expenseItems.removeAll { $0.id == itemID }
        }
    }

    func createIncomeItem(templateID: String, _ draft: TemplateIncomeItemDraft) async throws(APIError) -> TemplateIncomeItem {
        try record("createIncomeItem:\(templateID)")
        return with { state in
            state.templateIncomeDrafts.append(draft)
            let index = state.templates.firstIndex { $0.id == templateID }!
            let item = TemplateIncomeItem(id: "ii\(state.templateIncomeDrafts.count)", incomeSourceID: draft.incomeSourceID,
                                          dayOfMonth: draft.dayOfMonth, grossCents: draft.grossCents,
                                          grossTaxableCents: draft.grossTaxableCents, netCents: draft.netCents,
                                          note: draft.note, sortOrder: state.templates[index].incomeItems.count)
            state.templates[index].incomeItems.append(item)
            return item
        }
    }

    func updateIncomeItem(templateID: String, itemID: String, _ draft: TemplateIncomeItemDraft) async throws(APIError) -> TemplateIncomeItem {
        try record("updateIncomeItem:\(itemID)")
        return with { state in
            state.templateIncomeDrafts.append(draft)
            let index = state.templates.firstIndex { $0.id == templateID }!
            let at = state.templates[index].incomeItems.firstIndex { $0.id == itemID }!
            state.templates[index].incomeItems[at].incomeSourceID = draft.incomeSourceID
            state.templates[index].incomeItems[at].dayOfMonth = draft.dayOfMonth
            state.templates[index].incomeItems[at].grossCents = draft.grossCents
            state.templates[index].incomeItems[at].grossTaxableCents = draft.grossTaxableCents
            state.templates[index].incomeItems[at].netCents = draft.netCents
            state.templates[index].incomeItems[at].note = draft.note
            return state.templates[index].incomeItems[at]
        }
    }

    func deleteIncomeItem(templateID: String, itemID: String) async throws(APIError) {
        try record("deleteIncomeItem:\(itemID)")
        with { state in
            let index = state.templates.firstIndex { $0.id == templateID }!
            state.templates[index].incomeItems.removeAll { $0.id == itemID }
        }
    }

    /// Like the API: a month with data answers `month_not_empty` unless reset; copies are unconfirmed.
    func applyTemplate(month: String, templateID: String, resetMonth: Bool) async throws(APIError) -> TemplateApplyResult {
        try record("applyTemplate:\(month):\(templateID):\(resetMonth)")
        let result: TemplateApplyResult? = with { state in
            state.applyRequests.append((month, templateID, resetMonth))
            guard let template = state.templates.first(where: { $0.id == templateID }) else { return nil }
            let hasData = state.expenses.contains { CalendarDate.month(of: $0.date) == month }
                || state.income.contains { CalendarDate.month(of: $0.date) == month }
            if hasData && !resetMonth { return nil }
            let removedExpenses = state.expenses.count { CalendarDate.month(of: $0.date) == month }
            let removedIncome = state.income.count { CalendarDate.month(of: $0.date) == month }
            state.expenses.removeAll { CalendarDate.month(of: $0.date) == month }
            state.income.removeAll { CalendarDate.month(of: $0.date) == month }
            state.applies.removeAll { $0.month == month }
            let id = "apply\(state.applyRequests.count)"
            let last = CalendarDate.daysInMonth(year: CalendarDate.year(of: month), month: Int(month.suffix(2)) ?? 1)
            func date(_ day: Int) -> String { "\(month)-\(day < 10 ? "0" : "")\(min(day, last))" }
            for item in template.expenseItems {
                state.expenses.append(Expense(id: "\(id)-e\(item.id)", date: date(item.dayOfMonth), amountCents: item.amountCents,
                                              categoryID: item.categoryID, merchant: item.merchant, note: item.note,
                                              refundedExpenseID: nil, refundedTotalCents: 0, lastRefundDate: nil,
                                              confirmed: false, templateApplyID: id))
            }
            for item in template.incomeItems {
                state.income.append(IncomeEntry(id: "\(id)-i\(item.id)", date: date(item.dayOfMonth),
                                                incomeSourceID: item.incomeSourceID, grossCents: item.grossCents,
                                                grossTaxableCents: item.grossTaxableCents, netCents: item.netCents,
                                                note: item.note, confirmed: false, templateApplyID: id))
            }
            let count = template.expenseItems.count + template.incomeItems.count
            let apply = TemplateApply(id: id, templateID: templateID, templateName: template.name, month: month,
                                      createdExpenseCount: template.expenseItems.count,
                                      createdIncomeEntryCount: template.incomeItems.count, unconfirmedCount: count)
            state.applies.insert(apply, at: 0)
            return TemplateApplyResult(apply: apply, removedExpenseCount: removedExpenses,
                                       removedIncomeEntryCount: removedIncome)
        }
        guard let result else {
            throw APIError.code(with { $0.templates.contains { $0.id == templateID } } ? "month_not_empty" : "not_found",
                                status: with { $0.templates.contains { $0.id == templateID } } ? 409 : 404)
        }
        return result
    }

    func templateApplies(month: String) async throws(APIError) -> [TemplateApply] {
        try record("templateApplies:\(month)")
        return with { state in
            state.applies.filter { $0.month == month }.map { apply in
                var apply = apply
                apply.unconfirmedCount = state.expenses.count { $0.templateApplyID == apply.id && !$0.confirmed }
                    + state.income.count { $0.templateApplyID == apply.id && !$0.confirmed }
                return apply
            }
        }
    }

    func undoTemplateApply(id: String) async throws(APIError) -> TemplateUndoResult {
        try record("undoTemplateApply:\(id)")
        return with { state in
            let expenses = state.expenses.count { $0.templateApplyID == id && !$0.confirmed }
            let income = state.income.count { $0.templateApplyID == id && !$0.confirmed }
            state.expenses.removeAll { $0.templateApplyID == id && !$0.confirmed }
            state.income.removeAll { $0.templateApplyID == id && !$0.confirmed }
            return TemplateUndoResult(removedExpenseCount: expenses, removedIncomeEntryCount: income)
        }
    }
}

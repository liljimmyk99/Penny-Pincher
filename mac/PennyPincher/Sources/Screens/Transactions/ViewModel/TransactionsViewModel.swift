import Foundation
import Observation

/// Transactions (web/AGENTS.md "Transactions" and "Refunds"): the month's
/// income and expenses, category and refund filters with search, unconfirmed
/// template copies, refund tags and originals, edit, delete and Link….
/// Totals are summed here from the lists, so edits refresh them.
@MainActor
@Observable
final class TransactionsViewModel {
    let month: MonthSelection
    private(set) var phase: LoadPhase = .loading
    private(set) var categories: [ExpenseCategory] = []
    private(set) var sources: [IncomeSource] = []
    private(set) var expenses: [Expense] = []
    private(set) var incomeEntries: [IncomeEntry] = []
    /// Originals of this month's refunds that are dated in other months.
    private(set) var originals: [String: Expense] = [:]

    var categoryFilter: String?
    var refundFilter: RefundFilter?
    var search = ""
    var sortOrder: [KeyPathComparator<TransactionRow>] = [KeyPathComparator(\.date, order: .reverse)]
    var selection: Set<String> = []
    var incomeSelection: Set<String> = []

    var expenseEditor: ExpenseEditorViewModel?
    var incomeEditor: IncomeEditorViewModel?
    var linker: LinkRefundViewModel?
    var pendingDelete: TransactionDelete?

    private(set) var errorMessage: String?
    private(set) var statusMessage: String?
    private(set) var isWorking = false

    @ObservationIgnored private let api: LedgerAPI
    /// Selected once the month it is in has loaded ("Refund for …" in another month).
    @ObservationIgnored private var pendingSelection: String?

    init(api: LedgerAPI, month: MonthSelection) {
        self.api = api
        self.month = month
    }

    // MARK: Loading

    func load() async {
        if categories.isEmpty { phase = .loading }
        do throws(APIError) {
            categories = try await api.categories()
            sources = try await api.incomeSources()
            try await loadMonth()
            phase = .loaded
        } catch {
            phase = .failed(error.message)
        }
    }

    func monthChanged() async {
        if pendingSelection == nil {
            selection = []
        }
        incomeSelection = []
        do throws(APIError) {
            try await loadMonth()
            errorMessage = nil
        } catch {
            errorMessage = error.message
        }
    }

    /// Reloads the month after a change.
    func reload() async {
        do throws(APIError) {
            try await loadMonth()
        } catch {
            errorMessage = error.message
        }
    }

    var canEdit: Bool { phase == .loaded }

    // MARK: Expense rows

    var rows: [TransactionRow] {
        expenses
            .filter { expense in
                (categoryFilter.map { expense.categoryID == $0 } ?? true)
                    && (refundFilter?.matches(expense) ?? true)
                    && Self.matches(expense, search: search)
            }
            .map(row)
            .sorted(using: sortOrder)
    }

    var isFiltered: Bool { categoryFilter != nil || refundFilter != nil || !search.trimmed.isEmpty }

    var emptyMessage: LocalizedStringResource {
        expenses.isEmpty ? "transactions.empty.month" : "transactions.empty.filtered"
    }

    /// Case-insensitive match on the merchant name or the note; an empty query matches everything.
    static func matches(_ expense: Expense, search: String) -> Bool {
        let query = search.trimmed
        guard !query.isEmpty else { return true }
        return expense.merchant.name.localizedCaseInsensitiveContains(query)
            || (expense.note ?? "").localizedCaseInsensitiveContains(query)
    }

    func row(_ expense: Expense) -> TransactionRow {
        let category = categories.first { $0.id == expense.categoryID }
        let original = expense.refundedExpenseID.flatMap(original)
        return TransactionRow(
            id: expense.id,
            date: expense.date,
            dateText: CalendarDate.shortDate(expense.date),
            merchant: expense.merchant.name,
            categoryName: category?.name ?? "",
            isSaving: category?.isSaving ?? false,
            note: expense.note ?? "",
            amountCents: expense.amountCents,
            amountText: Money.format(expense.amountCents),
            isRefund: expense.isRefund,
            isUnconfirmed: !expense.confirmed,
            tag: expense.isRefund ? Refunds.tag(expense, original: original) : nil,
            refundForID: original?.id,
            refundForText: original.map { String(localized: "refund.for \(Refunds.describe($0))") },
            originalStatus: Refunds.status(expense)
        )
    }

    private func original(_ id: String) -> Expense? {
        expenses.first { $0.id == id } ?? originals[id]
    }

    // MARK: Category chips and totals

    /// Categories with entries this month, in the user's order.
    var categoryChips: [CategoryChip] {
        var sums: [String: (total: Int, count: Int)] = [:]
        for expense in expenses {
            let current = sums[expense.categoryID] ?? (0, 0)
            sums[expense.categoryID] = (current.total + expense.amountCents, current.count + 1)
        }
        let spent = Refunds.totals(expenses).afterCents
        let largest = sums.values.map(\.total).max() ?? 0
        return categories.compactMap { category in
            guard let sum = sums[category.id] else { return nil }
            return CategoryChip(
                id: category.id,
                name: category.name,
                count: sum.count,
                totalCents: sum.total,
                totalText: Money.format(sum.total),
                shareText: Self.share(sum.total, of: spent),
                barFraction: sum.total > 0 && largest > 0 ? Double(sum.total) / Double(largest) : 0,
                isSaving: category.isSaving,
                isSelected: categoryFilter == category.id
            )
        }
    }

    /// "34%", or "—" when nothing was spent. Whole percent, rounded half up.
    static func share(_ part: Int, of total: Int) -> String {
        guard total > 0 else { return "—" }
        let percent = (part * 200 + total) / (total * 2)
        return "\(percent)%"
    }

    /// Clicking a category here filters the list (Summary only highlights).
    func toggleCategory(_ id: String) {
        categoryFilter = categoryFilter == id ? nil : id
    }

    var refundTiles: RefundTiles {
        let totals = Refunds.totals(expenses)
        return RefundTiles(
            refundsText: Money.format(totals.refundCents),
            refundsDetail: String(localized: "transactions.tile.refundsDetail \(totals.refundCount) \(totals.linkedCount)"),
            beforeText: Money.format(totals.beforeCents),
            afterText: Money.format(totals.afterCents)
        )
    }

    // MARK: Income

    var incomeRows: [IncomeRow] {
        incomeEntries.map { entry in
            IncomeRow(
                id: entry.id,
                date: entry.date,
                dateText: CalendarDate.shortDate(entry.date),
                source: sources.first { $0.id == entry.incomeSourceID }?.name ?? "",
                label: entry.note ?? "",
                grossText: Money.format(entry.grossCents),
                taxableText: Money.format(entry.grossTaxableCents),
                netText: Money.format(entry.netCents),
                taxRateText: TaxRate.format(grossTaxableCents: entry.grossTaxableCents, netCents: entry.netCents),
                isUnconfirmed: !entry.confirmed
            )
        }
    }

    /// The income table's total row.
    var incomeTotal: IncomeRow {
        let gross = incomeEntries.reduce(0) { $0 + $1.grossCents }
        let taxable = incomeEntries.reduce(0) { $0 + $1.grossTaxableCents }
        let net = incomeEntries.reduce(0) { $0 + $1.netCents }
        return IncomeRow(
            id: "total", date: "", dateText: "", source: String(localized: "transactions.income.total"), label: "",
            grossText: Money.format(gross), taxableText: Money.format(taxable), netText: Money.format(net),
            taxRateText: TaxRate.format(grossTaxableCents: taxable, netCents: net), isUnconfirmed: false
        )
    }

    // MARK: Unconfirmed

    var unconfirmedCount: Int {
        expenses.count { !$0.confirmed } + incomeEntries.count { !$0.confirmed }
    }

    var unconfirmedText: String {
        String(localized: "transactions.unconfirmed.banner \(unconfirmedCount)")
    }

    func confirmAll() async {
        await work { () async throws(APIError) in
            try await api.confirmAll(month: month.month)
            try await loadMonth()
            statusMessage = String(localized: "transactions.confirmedAll")
        }
    }

    func confirmExpense(_ id: String) async {
        await work { () async throws(APIError) in
            _ = try await api.updateExpense(id: id, ExpenseChanges(confirmed: true))
            try await loadMonth()
        }
    }

    func confirmIncome(_ id: String) async {
        await work { () async throws(APIError) in
            _ = try await api.updateIncomeEntry(id: id, IncomeEntryChanges(confirmed: true))
            try await loadMonth()
        }
    }

    // MARK: Edit, delete, link

    func editExpense(_ id: String) {
        guard canEdit, let expense = expenses.first(where: { $0.id == id }) else { return }
        expenseEditor = ExpenseEditorViewModel(expense: expense, categories: categories, api: api) { [weak self] in
            await self?.reload()
            self?.statusMessage = String(localized: "transactions.saved")
        }
    }

    func editIncome(_ id: String) {
        guard canEdit, let entry = incomeEntries.first(where: { $0.id == id }) else { return }
        incomeEditor = IncomeEditorViewModel(entry: entry, sources: sources, api: api) { [weak self] in
            await self?.reload()
            self?.statusMessage = String(localized: "transactions.saved")
        }
    }

    func requestDeleteExpense(_ id: String) {
        guard canEdit, let expense = expenses.first(where: { $0.id == id }) else { return }
        let title = expense.isRefund ? String(localized: "transactions.delete.refundTitle \(expense.merchant.name)")
            : String(localized: "transactions.delete.expenseTitle \(expense.merchant.name)")
        let message = expense.refundedTotalCents != 0 ? String(localized: "transactions.delete.keepsRefunds")
            : String(localized: "transactions.delete.cantUndo")
        pendingDelete = TransactionDelete(kind: .expense, entryID: id, title: title, message: message)
    }

    func requestDeleteIncome(_ id: String) {
        guard canEdit, let entry = incomeEntries.first(where: { $0.id == id }) else { return }
        let source = sources.first { $0.id == entry.incomeSourceID }?.name ?? ""
        pendingDelete = TransactionDelete(kind: .income, entryID: id,
                                          title: String(localized: "transactions.delete.incomeTitle \(source)"),
                                          message: String(localized: "transactions.delete.cantUndo"))
    }

    func confirmDelete() async {
        guard let request = pendingDelete else { return }
        pendingDelete = nil
        await work { () async throws(APIError) in
            switch request.kind {
            case .expense: try await api.deleteExpense(id: request.entryID)
            case .income: try await api.deleteIncomeEntry(id: request.entryID)
            }
            selection.remove(request.entryID)
            incomeSelection.remove(request.entryID)
            try await loadMonth()
            statusMessage = String(localized: "transactions.deleted")
        }
    }

    func linkRefund(_ id: String) {
        guard canEdit, let refund = expenses.first(where: { $0.id == id }), refund.isRefund else { return }
        linker = LinkRefundViewModel(refund: refund, api: api) { [weak self] in
            await self?.reload()
            self?.statusMessage = String(localized: "transactions.linked")
        }
    }

    /// "Refund for …": select the original, switching month when it is in another.
    func showOriginal(_ refundID: String) {
        guard let refund = expenses.first(where: { $0.id == refundID }),
              let originalID = refund.refundedExpenseID, let original = original(originalID) else { return }
        categoryFilter = nil
        refundFilter = nil
        search = ""
        let target = CalendarDate.month(of: original.date)
        if target == month.month {
            selection = [original.id]
        } else {
            pendingSelection = original.id
            month.month = target
        }
    }

    func dismissMessages() {
        errorMessage = nil
        statusMessage = nil
    }

    // MARK: Private

    private func loadMonth() async throws(APIError) {
        let current = month.month
        let expenses = try await api.expenses(ExpenseQuery(month: current))
        let income = try await api.incomeEntries(month: current)
        guard current == month.month else { return }
        var originals: [String: Expense] = [:]
        let here = Set(expenses.map(\.id))
        for id in Set(expenses.compactMap(\.refundedExpenseID)) where !here.contains(id) {
            if let known = self.originals[id] {
                originals[id] = known
            } else {
                originals[id] = try? await api.expense(id: id)
            }
        }
        self.expenses = expenses
        incomeEntries = income
        self.originals = originals
        if let pending = pendingSelection {
            pendingSelection = nil
            selection = here.contains(pending) ? [pending] : []
        }
    }

    private func work(_ action: () async throws(APIError) -> Void) async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do throws(APIError) {
            try await action()
            errorMessage = nil
        } catch {
            errorMessage = error.message
            statusMessage = nil
        }
    }
}

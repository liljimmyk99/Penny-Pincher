import Foundation
import Observation

/// Add entries (web/AGENTS.md): one keyboard-first table that is the quick
/// entry with one row and a batch with several, refunds included, plus the
/// income form and the month's income so far. Every expense save is one
/// all-or-nothing batch; blank rows are skipped.
@MainActor
@Observable
final class AddEntriesViewModel {
    let month: MonthSelection
    private(set) var phase: LoadPhase = .loading
    private(set) var categories: [ExpenseCategory] = []
    private(set) var sources: [IncomeSource] = []

    var rows: [ExpenseRow]
    private(set) var rowErrors: [UUID: [ExpenseField: String]] = [:]
    private(set) var batchError: String?
    private(set) var isSavingExpenses = false

    /// Merchant autocomplete per row, and a refund row's possible originals.
    private(set) var suggestions: [UUID: [Merchant]] = [:]
    private(set) var refundCandidates: [UUID: [Expense]] = [:]

    var income: IncomeForm
    private(set) var incomeErrors: [IncomeField: String] = [:]
    private(set) var incomeError: String?
    private(set) var isSavingIncome = false
    /// The month's income entries so far.
    private(set) var incomeEntries: [IncomeEntry] = []

    /// A brief confirmation after a save.
    private(set) var statusMessage: String?
    /// Bumped by File ▸ New Expense so the view focuses the first blank row.
    private(set) var focusRequest = 0

    @ObservationIgnored private let api: LedgerAPI
    @ObservationIgnored private let today: () -> String
    @ObservationIgnored private let searchDelay: Duration
    @ObservationIgnored private var searches: [UUID: Task<Void, Never>] = [:]

    init(api: LedgerAPI, month: MonthSelection, today: @escaping () -> String = { CalendarDate.today() },
         searchDelay: Duration = .milliseconds(200)) {
        self.api = api
        self.month = month
        self.today = today
        self.searchDelay = searchDelay
        let date = CalendarDate.defaultDate(for: month.month, today: today())
        rows = [ExpenseRow(date: date)]
        income = IncomeForm(date: date)
    }

    // MARK: Loading

    func load() async {
        if categories.isEmpty { phase = .loading }
        do throws(APIError) {
            categories = try await api.categories()
            sources = try await api.incomeSources()
            if income.sourceID.isEmpty || !sources.contains(where: { $0.id == income.sourceID }) {
                income.sourceID = sources.first?.id ?? ""
            }
            try await loadIncome()
            phase = .loaded
        } catch {
            phase = .failed(error.message)
        }
    }

    /// The month changed (the switcher or View ▸ Previous/Next Month): blank rows
    /// and the income form move to its default date, and its income loads.
    func monthChanged() async {
        let date = defaultDate
        for index in rows.indices where rows[index].isBlank { rows[index].date = date }
        if income.gross.trimmed.isEmpty && income.net.trimmed.isEmpty { income.date = date }
        do throws(APIError) {
            try await loadIncome()
        } catch {
            incomeError = error.message
        }
    }

    var defaultDate: String { CalendarDate.defaultDate(for: month.month, today: today()) }
    var canEdit: Bool { phase == .loaded }

    // MARK: Expense rows

    /// Return in a row: focus moves to the next row, adding one at the end
    /// (it copies this row's date). Returns the row to focus.
    func rowAfter(_ id: UUID) -> UUID {
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return rows.last?.id ?? id }
        if index + 1 < rows.count { return rows[index + 1].id }
        return addRow(after: rows[index])
    }

    @discardableResult
    func addRow(refund: Bool = false) -> UUID {
        addRow(after: rows.last, refund: refund)
    }

    func removeRow(_ id: UUID) {
        rows.removeAll { $0.id == id }
        rowErrors[id] = nil
        suggestions[id] = nil
        refundCandidates[id] = nil
        searches.removeValue(forKey: id)?.cancel()
        if rows.isEmpty { rows = [ExpenseRow(date: defaultDate)] }
    }

    var canRemoveRows: Bool { rows.count > 1 }

    /// The first blank row (adding one if none is), for File ▸ New Expense.
    func firstBlankRow() -> UUID {
        rows.first(where: \.isBlank)?.id ?? addRow()
    }

    func requestFocus() {
        focusRequest += 1
    }

    func setCategory(_ id: UUID, _ categoryID: String) {
        update(id) {
            $0.categoryID = categoryID
            $0.categoryTouched = true
        }
        clearError(id, .category)
    }

    /// A refund row's "Refund for": linking is optional, and picking an
    /// original prefills its category.
    func setRefundLink(_ id: UUID, _ expenseID: String?) {
        let original = expenseID.flatMap { expenseID in refundCandidates[id]?.first { $0.id == expenseID } }
        update(id) {
            $0.refundedExpenseID = expenseID
            if let original { $0.categoryID = original.categoryID }
        }
    }

    func isRefundRow(_ id: UUID) -> Bool {
        rows.first { $0.id == id }?.isRefund ?? false
    }

    func errors(for id: UUID) -> [ExpenseField: String] { rowErrors[id] ?? [:] }

    func clearError(_ id: UUID, _ field: ExpenseField) {
        rowErrors[id]?[field] = nil
    }

    /// The merchant text changed: search after a short pause, and once the name
    /// matches a known merchant, use its usual category (unless one was chosen).
    func merchantChanged(_ id: UUID) {
        searches.removeValue(forKey: id)?.cancel()
        clearError(id, .merchant)
        guard let row = rows.first(where: { $0.id == id }) else { return }
        let text = row.merchant.trimmed
        if let known = suggestions[id]?.first(where: { $0.name.caseInsensitiveCompare(text) == .orderedSame }) {
            if row.merchantID != known.id { resolve(id, known) }
            return
        }
        update(id) { $0.merchantID = nil }
        refundCandidates[id] = nil
        guard !text.isEmpty else {
            suggestions[id] = []
            return
        }
        let delay = searchDelay
        searches[id] = Task { [weak self] in
            if delay > .zero { try? await Task.sleep(for: delay) }
            guard !Task.isCancelled else { return }
            await self?.search(id, text)
        }
    }

    // MARK: Save expenses

    func saveExpenses() async {
        guard canEdit, !isSavingExpenses else { return }
        statusMessage = nil
        batchError = nil
        let sent = rows.filter { !$0.isBlank }
        guard !sent.isEmpty else {
            batchError = String(localized: "add.error.nothingToSave")
            return
        }
        var errors: [UUID: [ExpenseField: String]] = [:]
        for row in sent {
            let problems = row.validate()
            if !problems.isEmpty { errors[row.id] = problems }
        }
        rowErrors = errors
        guard errors.isEmpty else { return }

        isSavingExpenses = true
        defer { isSavingExpenses = false }
        do throws(APIError) {
            let saved = try await api.createExpenses(sent.compactMap(\.draft))
            let date = sent.last?.date ?? defaultDate
            rows = [ExpenseRow(date: date)]
            suggestions = [:]
            refundCandidates = [:]
            statusMessage = saved.count == 1 ? String(localized: "add.saved.one")
                : String(localized: "add.saved.many \(saved.count)")
        } catch {
            let mapped = ExpenseRow.errors(from: error, sent: sent)
            rowErrors = mapped.byRow
            batchError = mapped.other.first ?? (mapped.byRow.isEmpty ? error.message : nil)
        }
    }

    // MARK: Income

    func incomeError(_ field: IncomeField) -> String? { incomeErrors[field] }

    func saveIncome() async {
        guard canEdit, !isSavingIncome else { return }
        statusMessage = nil
        incomeError = nil
        incomeErrors = income.validate()
        guard incomeErrors.isEmpty, let draft = income.draft else { return }
        isSavingIncome = true
        defer { isSavingIncome = false }
        do throws(APIError) {
            let entry = try await api.createIncomeEntry(draft)
            if CalendarDate.month(of: entry.date) == month.month {
                incomeEntries.insert(entry, at: 0)
                incomeEntries.sort { $0.date > $1.date }
            }
            income = IncomeForm(sourceID: income.sourceID, date: income.date)
            statusMessage = String(localized: "income.saved")
        } catch {
            incomeErrors = Self.incomeErrors(from: error)
            incomeError = incomeErrors.isEmpty ? error.message : nil
        }
    }

    var incomeTotalText: String { Money.format(incomeEntries.reduce(0) { $0 + $1.netCents }) }

    func sourceName(_ id: String) -> String {
        sources.first { $0.id == id }?.name ?? ""
    }

    func dismissStatus() {
        statusMessage = nil
        batchError = nil
        incomeError = nil
    }

    // MARK: Private

    @discardableResult
    private func addRow(after previous: ExpenseRow?, refund: Bool = false) -> UUID {
        let row = ExpenseRow(date: previous?.date ?? defaultDate, refund: refund)
        rows.append(row)
        return row.id
    }

    private func update(_ id: UUID, _ change: (inout ExpenseRow) -> Void) {
        guard let index = rows.firstIndex(where: { $0.id == id }) else { return }
        change(&rows[index])
    }

    private func search(_ id: UUID, _ text: String) async {
        let found: [Merchant]
        do throws(APIError) {
            found = try await api.merchants(prefix: text)
        } catch {
            return
        }
        guard let row = rows.first(where: { $0.id == id }), row.merchant.trimmed == text else { return }
        suggestions[id] = found
        if let known = found.first(where: { $0.name.caseInsensitiveCompare(text) == .orderedSame }) {
            resolve(id, known)
        }
    }

    /// The row names a known merchant: use its latest category, and for a
    /// refund, list its past expenses to link to.
    private func resolve(_ id: UUID, _ merchant: Merchant) {
        update(id) { $0.merchantID = merchant.id }
        Task { await prefill(id, merchant) }
    }

    private func prefill(_ id: UUID, _ merchant: Merchant) async {
        guard let row = rows.first(where: { $0.id == id }) else { return }
        if !row.categoryTouched,
           let latest = try? await api.expenses(ExpenseQuery(merchantID: merchant.id, kind: .expense, limit: 1)).first,
           let current = rows.first(where: { $0.id == id }), current.merchantID == merchant.id, !current.categoryTouched {
            update(id) { $0.categoryID = latest.categoryID }
            clearError(id, .category)
        }
        if row.isRefund { await loadRefundCandidates(id, merchant) }
    }

    func loadRefundCandidates(_ id: UUID) async {
        guard let row = rows.first(where: { $0.id == id }), row.isRefund, let merchantID = row.merchantID,
              refundCandidates[id] == nil else { return }
        await loadRefundCandidates(id, Merchant(id: merchantID, name: row.merchant))
    }

    private func loadRefundCandidates(_ id: UUID, _ merchant: Merchant) async {
        guard let past = try? await api.expenses(ExpenseQuery(merchantID: merchant.id, kind: .expense)),
              rows.first(where: { $0.id == id })?.merchantID == merchant.id else { return }
        refundCandidates[id] = past
    }

    private func loadIncome() async throws(APIError) {
        let current = month.month
        let entries = try await api.incomeEntries(month: current)
        guard current == month.month else { return }
        incomeEntries = entries
    }

    private static func incomeErrors(from error: APIError) -> [IncomeField: String] {
        var errors: [IncomeField: String] = [:]
        for detail in error.details {
            let field: IncomeField? = switch detail.field {
            case "income_source_id": .source
            case "date": .date
            case "gross_cents": .gross
            case "gross_taxable_cents": .taxable
            case "net_cents": .net
            case "note": .label
            default: nil
            }
            if let field, errors[field] == nil { errors[field] = detail.issue }
        }
        return errors
    }
}

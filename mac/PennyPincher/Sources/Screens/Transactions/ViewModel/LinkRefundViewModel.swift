import Foundation
import Observation

/// The Link… sheet for an unlinked refund: expenses from the 90 days up to the
/// refund's date, searchable, with a Suggested match preselected. Linking
/// sends only `refunded_expense_id`, so an unconfirmed refund stays unconfirmed.
@MainActor
@Observable
final class LinkRefundViewModel: Identifiable {
    static let lookbackDays = 90

    let id = UUID()
    let refund: Expense
    private(set) var phase: LoadPhase = .loading
    private(set) var candidates: [Expense] = []
    private(set) var suggested: Expense?
    var search = ""
    var selectedID: String?
    private(set) var errorMessage: String?
    private(set) var isSaving = false

    @ObservationIgnored private let api: EntriesAPI
    @ObservationIgnored private let onLinked: @MainActor () async -> Void

    init(refund: Expense, api: EntriesAPI, onLinked: @escaping @MainActor () async -> Void) {
        self.refund = refund
        self.api = api
        self.onLinked = onLinked
    }

    var refundText: String {
        String(localized: "link.refund \(refund.merchant.name) \(CalendarDate.shortDate(refund.date)) \(Money.format(refund.amountCents))")
    }

    func load() async {
        do throws(APIError) {
            candidates = try await api.expenses(ExpenseQuery(
                from: CalendarDate.addDays(refund.date, -Self.lookbackDays), to: refund.date, kind: .expense))
            suggested = Refunds.suggestion(for: refund, among: candidates)
            if selectedID == nil { selectedID = suggested?.id }
            phase = .loaded
        } catch {
            phase = .failed(error.message)
        }
    }

    /// Matching the search on merchant or note, the Suggested one first.
    var visible: [Expense] {
        let matching = candidates.filter { TransactionsViewModel.matches($0, search: search) }
        guard let suggested, let index = matching.firstIndex(of: suggested) else { return matching }
        var ordered = matching
        ordered.insert(ordered.remove(at: index), at: 0)
        return ordered
    }

    func isSuggested(_ expense: Expense) -> Bool { expense.id == suggested?.id }

    var canLink: Bool { selectedID != nil && !isSaving }

    /// Links and returns true when the sheet can close.
    func link() async -> Bool {
        guard let selectedID, !isSaving else { return false }
        isSaving = true
        defer { isSaving = false }
        do throws(APIError) {
            _ = try await api.updateExpense(id: refund.id, ExpenseChanges(refundedExpenseID: selectedID))
            await onLinked()
            return true
        } catch {
            errorMessage = error.message
            return false
        }
    }
}

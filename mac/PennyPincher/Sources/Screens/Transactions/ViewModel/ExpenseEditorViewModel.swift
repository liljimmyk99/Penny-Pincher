import Foundation
import Observation

/// The Edit expense sheet: sends only the changed fields. A negative amount is
/// a refund. Editing an unconfirmed copy also confirms it (the API does that).
@MainActor
@Observable
final class ExpenseEditorViewModel: Identifiable {
    let id = UUID()
    let original: Expense
    let categories: [ExpenseCategory]
    var date: String
    var merchant: String
    var categoryID: String
    var amount: String
    var note: String
    private(set) var errors: [ExpenseField: String] = [:]
    private(set) var errorMessage: String?
    private(set) var isSaving = false

    @ObservationIgnored private let api: EntriesAPI
    @ObservationIgnored private let onSaved: @MainActor () async -> Void

    init(expense: Expense, categories: [ExpenseCategory], api: EntriesAPI,
         onSaved: @escaping @MainActor () async -> Void) {
        original = expense
        self.categories = categories
        self.api = api
        self.onSaved = onSaved
        date = expense.date
        merchant = expense.merchant.name
        categoryID = expense.categoryID
        amount = Money.inputText(expense.amountCents)
        note = expense.note ?? ""
    }

    var title: LocalizedStringResource {
        isRefund ? "edit.expense.titleRefund" : "edit.expense.title"
    }

    var isRefund: Bool { (Money.parse(amount) ?? original.amountCents) < 0 }

    /// Only what differs from the saved expense.
    var changes: ExpenseChanges {
        var changes = ExpenseChanges()
        if date != original.date { changes.date = date }
        if merchant.trimmed != original.merchant.name { changes.merchantName = merchant.trimmed }
        if categoryID != original.categoryID { changes.categoryID = categoryID }
        if let cents = Money.parse(amount), cents != original.amountCents { changes.amountCents = cents }
        if note.trimmed != (original.note ?? "") { changes.note = note.trimmed }
        return changes
    }

    func error(_ field: ExpenseField) -> String? { errors[field] }

    /// Saves and returns true when the sheet can close.
    func save() async -> Bool {
        guard !isSaving else { return false }
        var row = ExpenseRow(date: date)
        row.merchant = merchant
        row.categoryID = categoryID
        row.amount = amount
        row.note = note
        errors = row.validate()
        errorMessage = nil
        guard errors.isEmpty else { return false }
        let changes = changes
        guard !changes.isEmpty else { return true }
        isSaving = true
        defer { isSaving = false }
        do throws(APIError) {
            _ = try await api.updateExpense(id: original.id, changes)
            await onSaved()
            return true
        } catch {
            for detail in error.details {
                if let field = ExpenseField(apiField: detail.field), errors[field] == nil { errors[field] = detail.issue }
            }
            errorMessage = errors.isEmpty ? error.message : nil
            return false
        }
    }
}

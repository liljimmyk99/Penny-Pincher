import Foundation
import Observation

/// The sheet that adds or edits a template's expense item: merchant (name),
/// optional note, category, day of month and amount.
@MainActor
@Observable
final class TemplateExpenseItemEditorViewModel: Identifiable {
    let id = UUID()
    let isNew: Bool
    let categories: [ExpenseCategory]
    var merchant: String
    var note: String
    var categoryID: String
    var day: String
    var amount: String
    private(set) var errors: [TemplateItemField: String] = [:]
    private(set) var errorMessage: String?
    private(set) var isSaving = false

    @ObservationIgnored private let commit: @MainActor (TemplateExpenseItemDraft) async throws(APIError) -> Void

    /// `item` is nil for a new one, which starts from the given category and day.
    init(item: TemplateExpenseItem?, categories: [ExpenseCategory], categoryID: String = "", day: Int = 1,
         commit: @escaping @MainActor (TemplateExpenseItemDraft) async throws(APIError) -> Void) {
        isNew = item == nil
        self.categories = categories
        self.commit = commit
        merchant = item?.merchant.name ?? ""
        note = item?.note ?? ""
        self.categoryID = item?.categoryID ?? categoryID
        self.day = String(item?.dayOfMonth ?? day)
        amount = item.map { Money.inputText($0.amountCents) } ?? ""
    }

    var title: LocalizedStringResource { isNew ? "templates.expense.addTitle" : "templates.expense.editTitle" }

    /// The draft, when every field is valid.
    func validate() -> TemplateExpenseItemDraft? {
        var errors: [TemplateItemField: String] = [:]
        let name = merchant.trimmed
        if name.isEmpty { errors[.merchant] = String(localized: "templates.error.name") }
        if name.count > FieldLimits.merchant { errors[.merchant] = String(localized: "templates.error.nameTooLong \(FieldLimits.merchant)") }
        if categoryID.isEmpty { errors[.category] = String(localized: "add.error.category") }
        let dayValue = TemplateItemParsing.day(day)
        if dayValue == nil { errors[.day] = String(localized: "templates.error.day") }
        let cents = Money.parse(amount)
        if amount.trimmed.isEmpty { errors[.amount] = String(localized: "add.error.amount") }
        else if cents == nil { errors[.amount] = String(localized: "add.error.amountFormat") }
        else if let cents, cents <= 0 { errors[.amount] = String(localized: "templates.error.amountPositive") }
        if note.trimmed.count > FieldLimits.note { errors[.note] = String(localized: "add.error.noteTooLong \(FieldLimits.note)") }
        self.errors = errors
        guard errors.isEmpty, let dayValue, let cents else { return nil }
        return TemplateExpenseItemDraft(categoryID: categoryID, merchantName: name, dayOfMonth: dayValue,
                                        amountCents: cents, note: note.trimmed.isEmpty ? nil : note.trimmed)
    }

    /// Saves and returns true when the sheet can close.
    func save() async -> Bool {
        guard !isSaving else { return false }
        errorMessage = nil
        guard let draft = validate() else { return false }
        isSaving = true
        defer { isSaving = false }
        do throws(APIError) {
            try await commit(draft)
            return true
        } catch {
            errorMessage = error.message
            return false
        }
    }
}

import Foundation

/// One row of the expense batch, as typed (web/src/pages/add/expenseRows.ts).
/// The amount stays text until save; `cents` turns it into signed integer cents.
struct ExpenseRow: Identifiable, Equatable, Sendable {
    let id: UUID
    var date: String
    var merchant = ""
    /// The existing merchant the name matches, once known.
    var merchantID: String?
    var categoryID = ""
    /// The user chose the category, so a merchant's usual one must not replace it.
    var categoryTouched = false
    var amount = ""
    var note = ""
    /// Added with "Add refund". A negative amount also makes a row a refund.
    var refund = false
    var refundedExpenseID: String?

    init(id: UUID = UUID(), date: String, refund: Bool = false) {
        self.id = id
        self.date = date
        self.refund = refund
    }

    /// Nothing typed yet; blank rows are skipped on save.
    var isBlank: Bool {
        merchant.trimmed.isEmpty && amount.trimmed.isEmpty && note.trimmed.isEmpty && !refund
    }

    var isRefund: Bool { refund || (Money.parse(amount) ?? 0) < 0 }

    /// The signed amount to save: a refund is negative whether "24.99" was typed
    /// in a refund row or "-24.99" in any row.
    var cents: Int? {
        guard let parsed = Money.parse(amount) else { return nil }
        return isRefund ? -abs(parsed) : abs(parsed)
    }

    func validate() -> [ExpenseField: String] {
        var errors: [ExpenseField: String] = [:]
        if !CalendarDate.isValid(date) { errors[.date] = String(localized: "add.error.date") }
        if merchant.trimmed.isEmpty {
            errors[.merchant] = String(localized: "add.error.merchant")
        } else if merchant.trimmed.count > FieldLimits.merchant {
            errors[.merchant] = String(localized: "add.error.tooLong \(FieldLimits.merchant)")
        }
        if categoryID.isEmpty { errors[.category] = String(localized: "add.error.category") }
        if amount.trimmed.isEmpty {
            errors[.amount] = String(localized: "add.error.amount")
        } else if let cents {
            if cents == 0 { errors[.amount] = String(localized: "add.error.amountZero") }
        } else {
            errors[.amount] = String(localized: "add.error.amountFormat")
        }
        if note.trimmed.count > FieldLimits.note { errors[.note] = String(localized: "add.error.noteTooLong \(FieldLimits.note)") }
        return errors
    }

    /// What to send; nil for a row that doesn't validate.
    var draft: ExpenseDraft? {
        guard validate().isEmpty, let cents else { return nil }
        return ExpenseDraft(
            date: date,
            amountCents: cents,
            categoryID: categoryID,
            merchantName: merchant.trimmed,
            note: note.trimmed.isEmpty ? nil : note.trimmed,
            refundedExpenseID: cents < 0 ? refundedExpenseID : nil
        )
    }

    /// Maps a batch error's `details` (`items[3].amount_cents`) back onto the
    /// rows that were sent, by position. Issues on other fields come back in `other`.
    static func errors(from error: APIError, sent: [ExpenseRow]) -> (byRow: [UUID: [ExpenseField: String]], other: [String]) {
        var byRow: [UUID: [ExpenseField: String]] = [:]
        var other: [String] = []
        for detail in error.details {
            guard let match = detail.field.wholeMatch(of: /items\[(\d+)\]\.(\w+)/),
                  let index = Int(match.output.1), sent.indices.contains(index),
                  let field = ExpenseField(apiField: String(match.output.2)) else {
                other.append(detail.issue)
                continue
            }
            let id = sent[index].id
            if byRow[id, default: [:]][field] == nil { byRow[id, default: [:]][field] = detail.issue }
        }
        return (byRow, other)
    }
}

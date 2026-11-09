/// A template in the list (`TemplateSummary`): items are fetched with one template.
struct TemplateSummary: Identifiable, Equatable, Hashable, Sendable {
    var id: String
    var name: String
    var expenseItemCount: Int
    var incomeItemCount: Int

    var itemCount: Int { expenseItemCount + incomeItemCount }
}

/// A full month, as a template (`Template`). Items are sorted by `sortOrder`.
struct Template: Identifiable, Equatable, Hashable, Sendable {
    var id: String
    var name: String
    var expenseItems: [TemplateExpenseItem]
    var incomeItems: [TemplateIncomeItem]
}

/// One bill or purchase in a template. The day is 1–31; the API moves 29–31 to
/// a short month's last day when the template is applied.
struct TemplateExpenseItem: Identifiable, Equatable, Hashable, Sendable {
    var id: String
    var categoryID: String
    var merchant: Merchant
    var dayOfMonth: Int
    var amountCents: Int
    var note: String?
    var sortOrder: Int
}

/// One paycheck in a template.
struct TemplateIncomeItem: Identifiable, Equatable, Hashable, Sendable {
    var id: String
    var incomeSourceID: String
    var dayOfMonth: Int
    var grossCents: Int
    var grossTaxableCents: Int
    var netCents: Int
    var note: String?
    var sortOrder: Int
}

/// An expense item to create or replace (`TemplateExpenseItemCreate`). A new
/// merchant name creates the merchant.
struct TemplateExpenseItemDraft: Equatable, Sendable {
    var categoryID: String
    var merchantName: String
    var dayOfMonth: Int
    var amountCents: Int
    var note: String?
}

/// An income item to create or replace (`TemplateIncomeItemCreate`).
struct TemplateIncomeItemDraft: Equatable, Sendable {
    var incomeSourceID: String
    var dayOfMonth: Int
    var grossCents: Int
    var grossTaxableCents: Int
    var netCents: Int
    var note: String?
}

/// One "start month from template" (`TemplateApply`), kept so it can be undone.
struct TemplateApply: Identifiable, Equatable, Hashable, Sendable {
    var id: String
    /// Nil when the template was deleted since.
    var templateID: String?
    var templateName: String?
    var month: String
    var createdExpenseCount: Int
    var createdIncomeEntryCount: Int
    /// What Undo would remove; hide Undo at zero.
    var unconfirmedCount: Int

    var createdCount: Int { createdExpenseCount + createdIncomeEntryCount }
}

/// The answer to applying a template (`TemplateApplyResult`).
struct TemplateApplyResult: Equatable, Sendable {
    var apply: TemplateApply
    /// Deleted by a month reset (zero for an empty month).
    var removedExpenseCount: Int
    var removedIncomeEntryCount: Int
}

/// What Undo removed.
struct TemplateUndoResult: Equatable, Sendable {
    var removedExpenseCount: Int
    var removedIncomeEntryCount: Int
}

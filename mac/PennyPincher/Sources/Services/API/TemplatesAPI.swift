/// Templates, their items, and the month actions that copy and undo them.
/// A protocol so view models can be tested without a server.
protocol TemplatesAPI: Sendable {
    /// Sorted by name, without items.
    func templates() async throws(APIError) -> [TemplateSummary]
    func template(id: String) async throws(APIError) -> Template
    func createTemplate(name: String) async throws(APIError) -> Template
    func renameTemplate(id: String, name: String) async throws(APIError) -> Template
    /// Entries already copied into months stay.
    func deleteTemplate(id: String) async throws(APIError)

    func createExpenseItem(templateID: String, _ draft: TemplateExpenseItemDraft) async throws(APIError) -> TemplateExpenseItem
    func updateExpenseItem(templateID: String, itemID: String, _ draft: TemplateExpenseItemDraft) async throws(APIError) -> TemplateExpenseItem
    func deleteExpenseItem(templateID: String, itemID: String) async throws(APIError)
    func createIncomeItem(templateID: String, _ draft: TemplateIncomeItemDraft) async throws(APIError) -> TemplateIncomeItem
    func updateIncomeItem(templateID: String, itemID: String, _ draft: TemplateIncomeItemDraft) async throws(APIError) -> TemplateIncomeItem
    func deleteIncomeItem(templateID: String, itemID: String) async throws(APIError)

    /// Copies every item into the month as an unconfirmed entry. A month with
    /// data answers `month_not_empty` unless `resetMonth` is true, which first
    /// deletes all of the month's expenses and income entries.
    func applyTemplate(month: String, templateID: String, resetMonth: Bool) async throws(APIError) -> TemplateApplyResult
    /// The month's applies, newest first.
    func templateApplies(month: String) async throws(APIError) -> [TemplateApply]
    /// Removes only the copies that are still unconfirmed.
    func undoTemplateApply(id: String) async throws(APIError) -> TemplateUndoResult
}

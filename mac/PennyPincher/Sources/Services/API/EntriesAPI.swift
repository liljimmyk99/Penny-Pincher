/// Expenses, refunds, income entries and merchant autocomplete.
protocol EntriesAPI: Sendable {
    /// Case-insensitive prefix search, sorted by name.
    func merchants(prefix: String) async throws(APIError) -> [Merchant]

    /// Newest first. Reads every page unless the query sets a limit.
    func expenses(_ query: ExpenseQuery) async throws(APIError) -> [Expense]
    func expense(id: String) async throws(APIError) -> Expense
    /// All or nothing; a failure's `details` name the item (`items[2].amount_cents`).
    func createExpenses(_ drafts: [ExpenseDraft]) async throws(APIError) -> [Expense]
    func updateExpense(id: String, _ changes: ExpenseChanges) async throws(APIError) -> Expense
    /// Its refunds stay, unlinked.
    func deleteExpense(id: String) async throws(APIError)

    /// The month's income entries (every page), newest first.
    func incomeEntries(month: String) async throws(APIError) -> [IncomeEntry]
    func createIncomeEntry(_ draft: IncomeEntryDraft) async throws(APIError) -> IncomeEntry
    func updateIncomeEntry(id: String, _ changes: IncomeEntryChanges) async throws(APIError) -> IncomeEntry
    func deleteIncomeEntry(id: String) async throws(APIError)

    /// Confirms every unconfirmed expense and income entry in the month.
    func confirmAll(month: String) async throws(APIError)
}

/// What the entry screens need: their pickers come from `CategoriesAPI`.
typealias LedgerAPI = CategoriesAPI & EntriesAPI & TemplatesAPI

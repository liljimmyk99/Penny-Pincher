/// Categories and income sources (the Categories & sources screen, and the
/// pickers on every entry form). A protocol so view models can be tested
/// without a server.
protocol CategoriesAPI: Sendable {
    func categories() async throws(APIError) -> [ExpenseCategory]
    func categoryStats(year: Int) async throws(APIError) -> [CategoryStats]
    func createCategory(name: String) async throws(APIError) -> ExpenseCategory
    func renameCategory(id: String, name: String) async throws(APIError) -> ExpenseCategory
    /// Moves its expenses and template items to "Other" in the same transaction.
    func deleteCategory(id: String) async throws(APIError)
    /// `ids` lists every category once, "Other" included.
    func reorderCategories(ids: [String]) async throws(APIError) -> [ExpenseCategory]

    func incomeSources() async throws(APIError) -> [IncomeSource]
    func incomeSourceStats(year: Int) async throws(APIError) -> [IncomeSourceStats]
    func createIncomeSource(name: String) async throws(APIError) -> IncomeSource
    func renameIncomeSource(id: String, name: String) async throws(APIError) -> IncomeSource
    /// Only for a source with no entries; its template items move to "Other".
    func deleteIncomeSource(id: String) async throws(APIError)
    func reorderIncomeSources(ids: [String]) async throws(APIError) -> [IncomeSource]
}

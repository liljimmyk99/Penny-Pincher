#if DEBUG
/// Fixed made-up data for SwiftUI previews only (never in a release build).
/// Writes answer as if they worked but change nothing.
struct PreviewLedgerAPI: LedgerAPI {
    var failing = false
    var month = "2026-10"

    private var failure: APIError { APIError.network() }

    private var categoryList: [ExpenseCategory] {
        ["Saving", "Housing", "Utilities", "Food", "Transportation", "Entertainment", "Debt", "Other"]
            .enumerated().map { index, name in
                ExpenseCategory(id: "c\(index)", name: name, color: nil, isSaving: index == 0,
                                isProtected: name == "Other", sortOrder: index)
            }
    }

    private var sourceList: [IncomeSource] {
        [IncomeSource(id: "s0", name: "Employer", isProtected: false, hasEntries: true, sortOrder: 0),
         IncomeSource(id: "s1", name: "Side job", isProtected: false, hasEntries: false, sortOrder: 1),
         IncomeSource(id: "s2", name: "Other", isProtected: true, hasEntries: false, sortOrder: 2)]
    }

    private func expense(_ id: String, _ day: String, _ cents: Int, _ category: String, _ merchant: String,
                         note: String? = nil, refunds: String? = nil, refundedTotal: Int = 0,
                         confirmed: Bool = true) -> Expense {
        Expense(id: id, date: "\(month)-\(day)", amountCents: cents, categoryID: category,
                merchant: Merchant(id: "m-\(merchant)", name: merchant), note: note, refundedExpenseID: refunds,
                refundedTotalCents: refundedTotal, lastRefundDate: refundedTotal == 0 ? nil : "\(month)-20",
                confirmed: confirmed, templateApplyID: confirmed ? nil : "apply")
    }

    private var expenseList: [Expense] {
        [expense("e1", "22", -2_500, "c3", "Corner Market", refunds: "e2"),
         expense("e5", "18", -1_200, "c5", "Cinema"),
         expense("e2", "14", 8_640, "c3", "Corner Market", note: "Weekly shop", refundedTotal: -2_500),
         expense("e3", "05", 40_000, "c0", "Brokerage", note: "Monthly transfer"),
         expense("e4", "01", 120_000, "c1", "Landlord", confirmed: false),
         expense("e6", "03", 6_450, "c2", "Power Co")]
    }

    func categories() async throws(APIError) -> [ExpenseCategory] {
        if failing { throw failure }
        return categoryList
    }

    func categoryStats(year: Int) async throws(APIError) -> [CategoryStats] {
        categoryList.enumerated().map { index, category in
            CategoryStats(categoryID: category.id, entryCount: index * 7, totalCents: index * 52_310,
                          yearTotalCents: index * 41_020)
        }
    }

    func createCategory(name: String) async throws(APIError) -> ExpenseCategory {
        ExpenseCategory(id: "new", name: name, color: nil, isSaving: false, isProtected: false, sortOrder: 99)
    }

    func renameCategory(id: String, name: String) async throws(APIError) -> ExpenseCategory {
        var category = categoryList.first { $0.id == id } ?? categoryList[0]
        category.name = name
        return category
    }

    func deleteCategory(id: String) async throws(APIError) {}

    func reorderCategories(ids: [String]) async throws(APIError) -> [ExpenseCategory] {
        ids.compactMap { id in categoryList.first { $0.id == id } }
    }

    func incomeSources() async throws(APIError) -> [IncomeSource] {
        if failing { throw failure }
        return sourceList
    }

    func incomeSourceStats(year: Int) async throws(APIError) -> [IncomeSourceStats] {
        [IncomeSourceStats(incomeSourceID: "s0", entryCount: 20, yearGrossCents: 6_000_000,
                           yearGrossTaxableCents: 5_400_000, yearNetCents: 4_100_000),
         IncomeSourceStats(incomeSourceID: "s1", entryCount: 0, yearGrossCents: 0, yearGrossTaxableCents: 0,
                           yearNetCents: 0),
         IncomeSourceStats(incomeSourceID: "s2", entryCount: 0, yearGrossCents: 0, yearGrossTaxableCents: 0,
                           yearNetCents: 0)]
    }

    func createIncomeSource(name: String) async throws(APIError) -> IncomeSource {
        IncomeSource(id: "new", name: name, isProtected: false, hasEntries: false, sortOrder: 99)
    }

    func renameIncomeSource(id: String, name: String) async throws(APIError) -> IncomeSource {
        var source = sourceList.first { $0.id == id } ?? sourceList[0]
        source.name = name
        return source
    }

    func deleteIncomeSource(id: String) async throws(APIError) {}

    func reorderIncomeSources(ids: [String]) async throws(APIError) -> [IncomeSource] {
        ids.compactMap { id in sourceList.first { $0.id == id } }
    }

    func merchants(prefix: String) async throws(APIError) -> [Merchant] {
        Set(expenseList.map(\.merchant)).filter { $0.name.lowercased().hasPrefix(prefix.lowercased()) }
            .sorted { $0.name < $1.name }
    }

    func expenses(_ query: ExpenseQuery) async throws(APIError) -> [Expense] {
        if failing { throw failure }
        return expenseList.filter { expense in
            (query.merchantID.map { expense.merchant.id == $0 } ?? true)
                && (query.kind.map { ($0 == .refund) == expense.isRefund } ?? true)
        }
    }

    func expense(id: String) async throws(APIError) -> Expense {
        guard let found = expenseList.first(where: { $0.id == id }) else { throw failure }
        return found
    }

    func createExpenses(_ drafts: [ExpenseDraft]) async throws(APIError) -> [Expense] {
        drafts.enumerated().map { index, draft in
            Expense(id: "new\(index)", date: draft.date, amountCents: draft.amountCents, categoryID: draft.categoryID,
                    merchant: Merchant(id: "m", name: draft.merchantName), note: draft.note,
                    refundedExpenseID: draft.refundedExpenseID, refundedTotalCents: 0, lastRefundDate: nil,
                    confirmed: true, templateApplyID: nil)
        }
    }

    func updateExpense(id: String, _ changes: ExpenseChanges) async throws(APIError) -> Expense {
        try await expense(id: id)
    }

    func deleteExpense(id: String) async throws(APIError) {}

    func incomeEntries(month: String) async throws(APIError) -> [IncomeEntry] {
        if failing { throw failure }
        return [IncomeEntry(id: "i1", date: "\(month)-15", incomeSourceID: "s0", grossCents: 300_000,
                            grossTaxableCents: 270_000, netCents: 205_000, note: "Paycheck", confirmed: true,
                            templateApplyID: nil),
                IncomeEntry(id: "i2", date: "\(month)-01", incomeSourceID: "s0", grossCents: 300_000,
                            grossTaxableCents: 270_000, netCents: 205_000, note: "Paycheck", confirmed: false,
                            templateApplyID: "apply")]
    }

    func createIncomeEntry(_ draft: IncomeEntryDraft) async throws(APIError) -> IncomeEntry {
        IncomeEntry(id: "new", date: draft.date, incomeSourceID: draft.incomeSourceID, grossCents: draft.grossCents,
                    grossTaxableCents: draft.grossTaxableCents, netCents: draft.netCents, note: draft.note,
                    confirmed: true, templateApplyID: nil)
    }

    func updateIncomeEntry(id: String, _ changes: IncomeEntryChanges) async throws(APIError) -> IncomeEntry {
        try await incomeEntries(month: month)[0]
    }

    func deleteIncomeEntry(id: String) async throws(APIError) {}

    func confirmAll(month: String) async throws(APIError) {}
}
#endif

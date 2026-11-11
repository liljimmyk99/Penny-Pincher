#if DEBUG
/// Fixed made-up data for SwiftUI previews only (never in a release build).
/// Writes answer as if they worked but change nothing.
struct PreviewLedgerAPI: LedgerAPI {
    var failing = false
    var month = "2026-10"
    /// No saved trends, for the empty Trends preview.
    var emptyTrends = false

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

    func allMerchants() async throws(APIError) -> [Merchant] {
        if failing { throw failure }
        return Set(expenseList.map(\.merchant)).sorted { $0.name < $1.name }
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

    // MARK: Templates

    private var templateList: [Template] {
        [Template(
            id: "t0", name: "Typical month",
            expenseItems: [
                TemplateExpenseItem(id: "ti0", categoryID: "c1", merchant: Merchant(id: "m-Landlord", name: "Landlord"),
                                    dayOfMonth: 1, amountCents: 120_000, note: nil, sortOrder: 0),
                TemplateExpenseItem(id: "ti1", categoryID: "c2", merchant: Merchant(id: "m-Power Co", name: "Power Co"),
                                    dayOfMonth: 3, amountCents: 6_450, note: nil, sortOrder: 1),
                TemplateExpenseItem(id: "ti2", categoryID: "c0", merchant: Merchant(id: "m-Brokerage", name: "Brokerage"),
                                    dayOfMonth: 5, amountCents: 40_000, note: "Monthly transfer", sortOrder: 2),
                TemplateExpenseItem(id: "ti3", categoryID: "c5", merchant: Merchant(id: "m-Streaming", name: "Streaming"),
                                    dayOfMonth: 31, amountCents: 1_599, note: nil, sortOrder: 3),
            ],
            incomeItems: [
                TemplateIncomeItem(id: "tn0", incomeSourceID: "s0", dayOfMonth: 15, grossCents: 300_000,
                                   grossTaxableCents: 270_000, netCents: 205_000, note: "Paycheck", sortOrder: 0),
            ]),
         Template(id: "t1", name: "Lean month", expenseItems: [], incomeItems: [])]
    }

    func templates() async throws(APIError) -> [TemplateSummary] {
        if failing { throw failure }
        return templateList.map {
            TemplateSummary(id: $0.id, name: $0.name, expenseItemCount: $0.expenseItems.count,
                            incomeItemCount: $0.incomeItems.count)
        }
    }

    func template(id: String) async throws(APIError) -> Template {
        guard let found = templateList.first(where: { $0.id == id }) else { throw failure }
        return found
    }

    func createTemplate(name: String) async throws(APIError) -> Template {
        Template(id: "new", name: name, expenseItems: [], incomeItems: [])
    }

    func renameTemplate(id: String, name: String) async throws(APIError) -> Template {
        var template = templateList.first { $0.id == id } ?? templateList[0]
        template.name = name
        return template
    }

    func deleteTemplate(id: String) async throws(APIError) {}

    func createExpenseItem(templateID: String, _ draft: TemplateExpenseItemDraft) async throws(APIError) -> TemplateExpenseItem {
        TemplateExpenseItem(id: "new", categoryID: draft.categoryID, merchant: Merchant(id: "m", name: draft.merchantName),
                            dayOfMonth: draft.dayOfMonth, amountCents: draft.amountCents, note: draft.note, sortOrder: 99)
    }

    func updateExpenseItem(templateID: String, itemID: String, _ draft: TemplateExpenseItemDraft) async throws(APIError) -> TemplateExpenseItem {
        TemplateExpenseItem(id: itemID, categoryID: draft.categoryID, merchant: Merchant(id: "m", name: draft.merchantName),
                            dayOfMonth: draft.dayOfMonth, amountCents: draft.amountCents, note: draft.note, sortOrder: 0)
    }

    func deleteExpenseItem(templateID: String, itemID: String) async throws(APIError) {}

    func createIncomeItem(templateID: String, _ draft: TemplateIncomeItemDraft) async throws(APIError) -> TemplateIncomeItem {
        TemplateIncomeItem(id: "new", incomeSourceID: draft.incomeSourceID, dayOfMonth: draft.dayOfMonth,
                           grossCents: draft.grossCents, grossTaxableCents: draft.grossTaxableCents,
                           netCents: draft.netCents, note: draft.note, sortOrder: 99)
    }

    func updateIncomeItem(templateID: String, itemID: String, _ draft: TemplateIncomeItemDraft) async throws(APIError) -> TemplateIncomeItem {
        TemplateIncomeItem(id: itemID, incomeSourceID: draft.incomeSourceID, dayOfMonth: draft.dayOfMonth,
                           grossCents: draft.grossCents, grossTaxableCents: draft.grossTaxableCents,
                           netCents: draft.netCents, note: draft.note, sortOrder: 0)
    }

    func deleteIncomeItem(templateID: String, itemID: String) async throws(APIError) {}

    func applyTemplate(month: String, templateID: String, resetMonth: Bool) async throws(APIError) -> TemplateApplyResult {
        TemplateApplyResult(apply: TemplateApply(id: "apply", templateID: templateID, templateName: "Typical month",
                                                 month: month, createdExpenseCount: 4, createdIncomeEntryCount: 1,
                                                 unconfirmedCount: 5),
                            removedExpenseCount: 0, removedIncomeEntryCount: 0)
    }

    func templateApplies(month: String) async throws(APIError) -> [TemplateApply] {
        [TemplateApply(id: "apply", templateID: "t0", templateName: "Typical month", month: month,
                       createdExpenseCount: 1, createdIncomeEntryCount: 1, unconfirmedCount: 2)]
    }

    func undoTemplateApply(id: String) async throws(APIError) -> TemplateUndoResult {
        TemplateUndoResult(removedExpenseCount: 1, removedIncomeEntryCount: 1)
    }

    // MARK: Summaries

    func monthlySummary(month: String) async throws(APIError) -> MonthlySummary {
        if failing { throw failure }
        func category(_ index: Int, _ total: Int, _ previous: Int, _ count: Int) -> MonthlySummary.Category {
            let source = categoryList[index]
            return MonthlySummary.Category(id: source.id, name: source.name, color: nil, isSaving: source.isSaving,
                                           isProtected: source.isProtected, totalCents: total, expenseCount: count,
                                           refundCount: 0, previousMonthTotalCents: previous)
        }
        let employer = IncomeTotals(grossCents: 600_000, grossTaxableCents: 540_000, netCents: 410_000, entryCount: 2)
        return MonthlySummary(
            month: month,
            sources: [MonthlySummary.Source(id: "s0", name: "Employer", isProtected: false, totals: employer),
                      MonthlySummary.Source(id: "s1", name: "Side job", isProtected: false, totals: .zero),
                      MonthlySummary.Source(id: "s2", name: "Other", isProtected: true, totals: .zero)],
            combined: employer,
            categories: [category(0, 80_000, 60_000, 2), category(1, 120_000, 120_000, 1), category(2, 14_000, 12_500, 2),
                         category(3, 52_000, 61_000, 9), category(4, 18_000, 18_000, 3), category(5, 12_000, 4_000, 2),
                         category(6, 0, 0, 0), category(7, 0, 0, 0)],
            totalCents: 296_000, savingCents: 80_000, previousMonthTotalCents: 275_500, leftOverCents: 114_000,
            unconfirmedExpenseCount: 1, unconfirmedIncomeCount: 1,
            applies: [TemplateApply(id: "apply", templateID: "t0", templateName: "Typical month", month: month,
                                    createdExpenseCount: 1, createdIncomeEntryCount: 1, unconfirmedCount: 2)],
            isEmpty: false)
    }

    func yearlySummary(year: Int) async throws(APIError) -> YearlySummary {
        if failing { throw failure }
        let months = (1...12).map { index -> YearlySummary.Month in
            let has = index <= 10
            let net = has ? 410_000 + index * 3_000 : 0
            let spent = has ? 280_000 + (index % 4) * 20_000 : 0
            return YearlySummary.Month(month: "\(year)-\(index < 10 ? "0" : "")\(index)", grossCents: has ? 600_000 : 0,
                                       grossTaxableCents: has ? 540_000 : 0, netCents: net, spentCents: spent,
                                       savingCents: has ? 60_000 : 0, leftOverCents: net - spent, hasEntries: has)
        }
        func category(_ index: Int, _ total: Int) -> YearlySummary.Category {
            let source = categoryList[index]
            return YearlySummary.Category(id: source.id, name: source.name, color: nil, isSaving: source.isSaving,
                                          isProtected: source.isProtected, totalCents: total, monthlyAverageCents: total / 10)
        }
        return YearlySummary(
            year: year, months: months,
            categories: [category(0, 600_000), category(1, 1_200_000), category(2, 140_000), category(3, 520_000),
                         category(4, 180_000), category(5, 120_000), category(6, 0), category(7, 30_000)],
            totals: .init(grossCents: 6_000_000, grossTaxableCents: 5_400_000,
                          netCents: months.reduce(0) { $0 + $1.netCents }, spentCents: months.reduce(0) { $0 + $1.spentCents },
                          savingCents: 600_000, leftOverCents: months.reduce(0) { $0 + $1.leftOverCents }),
            averageMonthCount: 10)
    }

    // MARK: Trends

    private var trendList: [SavedTrend] {
        [SavedTrend(id: "tr0", name: "Corner Market runs", matchType: .merchant, merchantID: "m-Corner Market",
                    categoryID: nil, matchText: nil, measure: .amount, sortOrder: 0),
         SavedTrend(id: "tr1", name: "Eating out", matchType: .category, merchantID: nil, categoryID: "c3",
                    matchText: nil, measure: .count, sortOrder: 1),
         SavedTrend(id: "tr2", name: "Weekly shops", matchType: .note, merchantID: nil, categoryID: nil,
                    matchText: "weekly", measure: .amount, sortOrder: 2)]
    }

    func savedTrends() async throws(APIError) -> [SavedTrend] {
        if failing { throw failure }
        return emptyTrends ? [] : trendList
    }

    func createSavedTrend(_ draft: SavedTrendDraft) async throws(APIError) -> SavedTrend {
        SavedTrend(id: "new", name: draft.name, matchType: draft.matchType, merchantID: draft.merchantID,
                   categoryID: draft.categoryID, matchText: draft.matchText, measure: draft.measure, sortOrder: 99)
    }

    func customTrend(_ query: CustomTrendQuery) async throws(APIError) -> [TrendBucket] {
        if failing { throw failure }
        let first = CalendarDate.month(of: query.from)
        let seed = (query.merchantID ?? query.categoryID ?? query.text ?? "").count
        return (0..<12).map { offset in
            let count = offset < 2 ? 0 : (offset * 3 + seed) % 7 + 1
            return TrendBucket(period: CalendarDate.shiftMonth(first, by: offset), totalCents: count * (2_150 + seed * 40),
                               count: count)
        }
    }

    func categoryTrends(year: Int) async throws(APIError) -> CategoryTrends {
        if failing { throw failure }
        let series = categoryList.enumerated().map { index, category in
            let base = [40_000, 120_000, 13_000, 52_000, 18_000, 9_000, 0, 3_000][index]
            func values(_ shift: Int) -> [Int] {
                (0..<12).map { month in base == 0 ? 0 : base + ((month + shift + index) % 5 - 2) * base / 10 }
            }
            return CategoryTrends.Series(categoryID: category.id, name: category.name, color: nil,
                                         isSaving: category.isSaving, thisYearCents: values(1), lastYearCents: values(3))
        }
        func total(_ path: KeyPath<CategoryTrends.Series, [Int]>) -> [Int] {
            (0..<12).map { month in series.reduce(0) { $0 + $1[keyPath: path][month] } }
        }
        return CategoryTrends(
            year: year,
            allSpending: CategoryTrends.Series(categoryID: nil, name: "All spending", color: nil, isSaving: false,
                                               thisYearCents: total(\.thisYearCents), lastYearCents: total(\.lastYearCents)),
            categories: series)
    }
}
#endif

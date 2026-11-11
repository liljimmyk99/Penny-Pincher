extension APIClient: SummariesAPI {
    func monthlySummary(month: String) async throws(APIError) -> MonthlySummary {
        try await perform {
            MonthlySummary(try await client.getMonthlySummary(path: .init(month: month)).ok.body.json)
        }
    }

    func yearlySummary(year: Int) async throws(APIError) -> YearlySummary {
        try await perform {
            YearlySummary(try await client.getYearlySummary(path: .init(year: year)).ok.body.json)
        }
    }
}

extension IncomeTotals {
    init(_ schema: Components.Schemas.IncomeTotals) {
        self.init(grossCents: Int(schema.grossCents), grossTaxableCents: Int(schema.grossTaxableCents),
                  netCents: Int(schema.netCents), entryCount: schema.entryCount)
    }
}

extension MonthlySummary {
    init(_ schema: Components.Schemas.MonthlySummary) {
        self.init(
            month: schema.month,
            sources: schema.income.sources.map { source in
                Source(id: source.value2.incomeSourceId, name: source.value2.name,
                       isProtected: source.value2.isProtected, totals: IncomeTotals(source.value1))
            },
            combined: IncomeTotals(schema.income.combined),
            categories: schema.spending.categories.map { category in
                Category(id: category.categoryId, name: category.name, color: category.color,
                         isSaving: category.isSaving, isProtected: category.isProtected,
                         totalCents: Int(category.totalCents.value1), expenseCount: category.expenseCount,
                         refundCount: category.refundCount,
                         previousMonthTotalCents: Int(category.previousMonthTotalCents))
            },
            totalCents: Int(schema.spending.totalCents.value1),
            savingCents: Int(schema.spending.savingCents.value1),
            previousMonthTotalCents: Int(schema.spending.previousMonthTotalCents),
            leftOverCents: Int(schema.leftOverCents.value1),
            unconfirmedExpenseCount: schema.unconfirmed.expenseCount,
            unconfirmedIncomeCount: schema.unconfirmed.incomeEntryCount,
            applies: schema.templateApplies.map(TemplateApply.init),
            isEmpty: schema.isEmpty
        )
    }
}

extension YearlySummary {
    init(_ schema: Components.Schemas.YearlySummary) {
        self.init(
            year: Int(schema.year),
            months: schema.months.map { month in
                Month(month: month.month, grossCents: Int(month.grossCents),
                      grossTaxableCents: Int(month.grossTaxableCents), netCents: Int(month.netCents),
                      spentCents: Int(month.spentCents), savingCents: Int(month.savingCents),
                      leftOverCents: Int(month.leftOverCents), hasEntries: month.hasEntries)
            },
            categories: schema.categories.map { category in
                Category(id: category.categoryId, name: category.name, color: category.color,
                         isSaving: category.isSaving, isProtected: category.isProtected,
                         totalCents: Int(category.totalCents), monthlyAverageCents: Int(category.monthlyAverageCents.value1))
            },
            totals: Totals(grossCents: Int(schema.totals.grossCents), grossTaxableCents: Int(schema.totals.grossTaxableCents),
                           netCents: Int(schema.totals.netCents), spentCents: Int(schema.totals.spentCents),
                           savingCents: Int(schema.totals.savingCents), leftOverCents: Int(schema.totals.leftOverCents)),
            averageMonthCount: schema.averageMonthCount
        )
    }
}

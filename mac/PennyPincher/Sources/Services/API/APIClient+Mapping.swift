/// Generated `Components.Schemas` types to the app's own models. The generated
/// types stay inside `Services/API`.
extension ExpenseCategory {
    init(_ schema: Components.Schemas.Category) {
        self.init(id: schema.id, name: schema.name, color: schema.color, isSaving: schema.isSaving,
                  isProtected: schema.isProtected, sortOrder: schema.sortOrder)
    }
}

extension IncomeSource {
    init(_ schema: Components.Schemas.IncomeSource) {
        self.init(id: schema.id, name: schema.name, isProtected: schema.isProtected,
                  hasEntries: schema.hasEntries, sortOrder: schema.sortOrder)
    }
}

extension CategoryStats {
    init(_ schema: Components.Schemas.CategoryStats) {
        self.init(categoryID: schema.categoryId, entryCount: schema.entryCount,
                  totalCents: Int(schema.totalCents.value1), yearTotalCents: Int(schema.yearTotalCents.value1))
    }
}

extension IncomeSourceStats {
    init(_ schema: Components.Schemas.IncomeSourceStats) {
        self.init(incomeSourceID: schema.incomeSourceId, entryCount: schema.entryCount,
                  yearGrossCents: Int(schema.yearGrossCents), yearGrossTaxableCents: Int(schema.yearGrossTaxableCents),
                  yearNetCents: Int(schema.yearNetCents))
    }
}

extension Merchant {
    init(_ schema: Components.Schemas.Merchant) {
        self.init(id: schema.id, name: schema.name)
    }
}

extension Expense {
    init(_ schema: Components.Schemas.Expense) {
        self.init(
            id: schema.id,
            date: schema.date,
            amountCents: Int(schema.amountCents),
            categoryID: schema.categoryId,
            merchant: Merchant(schema.merchant),
            note: schema.note,
            refundedExpenseID: schema.refundedExpenseId,
            refundedTotalCents: Int(schema.refundedTotalCents.value1),
            lastRefundDate: schema.lastRefundDate,
            confirmed: schema.confirmed,
            templateApplyID: schema.templateApplyId
        )
    }
}

extension IncomeEntry {
    init(_ schema: Components.Schemas.IncomeEntry) {
        self.init(id: schema.id, date: schema.date, incomeSourceID: schema.incomeSourceId,
                  grossCents: Int(schema.grossCents), grossTaxableCents: Int(schema.grossTaxableCents),
                  netCents: Int(schema.netCents), note: schema.note, confirmed: schema.confirmed,
                  templateApplyID: schema.templateApplyId)
    }
}

extension ExpenseDraft {
    var schema: Components.Schemas.ExpenseCreate {
        .init(date: date, amountCents: .init(value1: Int64(amountCents)), categoryId: categoryID,
              merchantName: merchantName, note: note, refundedExpenseId: refundedExpenseID, confirmed: true)
    }
}

extension ExpenseChanges {
    var schema: Components.Schemas.ExpenseUpdate {
        .init(date: date, amountCents: amountCents.map { .init(value1: Int64($0)) }, categoryId: categoryID,
              merchantName: merchantName, note: note, refundedExpenseId: refundedExpenseID, confirmed: confirmed)
    }
}

extension IncomeEntryDraft {
    var schema: Components.Schemas.IncomeEntryCreate {
        .init(date: date, incomeSourceId: incomeSourceID, grossCents: Int64(grossCents),
              grossTaxableCents: Int64(grossTaxableCents), netCents: Int64(netCents), note: note, confirmed: true)
    }
}

extension IncomeEntryChanges {
    var schema: Components.Schemas.IncomeEntryUpdate {
        .init(date: date, incomeSourceId: incomeSourceID, grossCents: grossCents.map(Int64.init),
              grossTaxableCents: grossTaxableCents.map(Int64.init), netCents: netCents.map(Int64.init),
              note: note, confirmed: confirmed)
    }
}

/// A template's planned figures, summed from its items (never stored). Saving
/// counts as spending, with the saved part noted.
struct TemplateTotals: Equatable, Sendable {
    var netIncomeCents: Int
    var spendingCents: Int
    var savedCents: Int

    var leftOverCents: Int { netIncomeCents - spendingCents }

    init(_ template: Template, categories: [ExpenseCategory]) {
        let saving = Set(categories.filter(\.isSaving).map(\.id))
        netIncomeCents = template.incomeItems.reduce(0) { $0 + $1.netCents }
        spendingCents = template.expenseItems.reduce(0) { $0 + $1.amountCents }
        savedCents = template.expenseItems.filter { saving.contains($0.categoryID) }.reduce(0) { $0 + $1.amountCents }
    }
}

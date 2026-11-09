import Foundation
@testable import PennyPincher

/// Generic made-up ledger data (AGENTS.md §9).
enum Fixture {
    static let saving = ExpenseCategory(id: "c-saving", name: "Saving", color: nil, isSaving: true, isProtected: false, sortOrder: 0)
    static let food = ExpenseCategory(id: "c-food", name: "Food", color: nil, isSaving: false, isProtected: false, sortOrder: 1)
    static let fun = ExpenseCategory(id: "c-fun", name: "Fun", color: nil, isSaving: false, isProtected: false, sortOrder: 2)
    static let other = ExpenseCategory(id: "c-other", name: "Other", color: nil, isSaving: false, isProtected: true, sortOrder: 3)
    static let categories = [saving, food, fun, other]

    static let job = IncomeSource(id: "s-job", name: "Job", isProtected: false, hasEntries: true, sortOrder: 0)
    static let gig = IncomeSource(id: "s-gig", name: "Gig", isProtected: false, hasEntries: false, sortOrder: 1)
    static let otherSource = IncomeSource(id: "s-other", name: "Other", isProtected: true, hasEntries: false, sortOrder: 2)
    static let sources = [job, gig, otherSource]

    static let store = Merchant(id: "m-store", name: "Corner Store")
    static let cafe = Merchant(id: "m-cafe", name: "Cafe")

    static func expense(_ id: String, _ date: String, _ cents: Int, category: String = food.id,
                        merchant: Merchant = store, note: String? = nil, refunds: String? = nil,
                        refundedTotal: Int = 0, lastRefund: String? = nil, confirmed: Bool = true) -> Expense {
        Expense(id: id, date: date, amountCents: cents, categoryID: category, merchant: merchant, note: note,
                refundedExpenseID: refunds, refundedTotalCents: refundedTotal, lastRefundDate: lastRefund,
                confirmed: confirmed, templateApplyID: confirmed ? nil : "apply")
    }

    static func income(_ id: String, _ date: String, gross: Int = 100_000, taxable: Int = 90_000, net: Int = 70_000,
                       source: String = job.id, note: String? = nil, confirmed: Bool = true) -> IncomeEntry {
        IncomeEntry(id: id, date: date, incomeSourceID: source, grossCents: gross, grossTaxableCents: taxable,
                    netCents: net, note: note, confirmed: confirmed, templateApplyID: nil)
    }

    static func ledger(_ change: (inout FakeLedgerAPI.State) -> Void = { _ in }) -> FakeLedgerAPI {
        let api = FakeLedgerAPI()
        api.with { state in
            state.categories = categories
            state.sources = sources
            change(&state)
        }
        return api
    }
}

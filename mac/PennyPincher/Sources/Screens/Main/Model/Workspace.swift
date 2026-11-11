import Foundation

/// The signed-in person's screens, built once per account so another
/// person's data is never shown after a sign-in change. Add entries and
/// Transactions and Summary share the month.
@MainActor
final class Workspace {
    let accountID: String
    let month: MonthSelection
    let categories: CategoriesViewModel
    let addEntries: AddEntriesViewModel
    let transactions: TransactionsViewModel
    let templates: TemplatesViewModel
    let summary: SummaryViewModel
    let yearly: YearlyViewModel

    init(accountID: String, api: LedgerAPI, today: String = CalendarDate.today(), defaults: UserDefaults = .standard) {
        self.accountID = accountID
        month = MonthSelection(month: CalendarDate.month(of: today))
        categories = CategoriesViewModel(api: api, today: today)
        addEntries = AddEntriesViewModel(api: api, month: month, today: { CalendarDate.today() })
        transactions = TransactionsViewModel(api: api, month: month)
        templates = TemplatesViewModel(api: api, month: month.month)
        summary = SummaryViewModel(api: api, month: month, defaults: defaults, today: { CalendarDate.today() })
        yearly = YearlyViewModel(api: api, today: today)
    }
}

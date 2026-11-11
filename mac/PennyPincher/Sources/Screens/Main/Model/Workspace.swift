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
    let trends: TrendsViewModel
    let importTracker: ImportTracker
    let importer: ImportViewModel

    init(
        accountID: String,
        api: LedgerAPI,
        importEvents: ImportEventSource = NoImportEvents(),
        notifier: FinishNotifier = .silent,
        today: String = CalendarDate.today(),
        defaults: UserDefaults = .standard
    ) {
        self.accountID = accountID
        month = MonthSelection(month: CalendarDate.month(of: today))
        categories = CategoriesViewModel(api: api, today: today)
        addEntries = AddEntriesViewModel(api: api, month: month, today: { CalendarDate.today() })
        transactions = TransactionsViewModel(api: api, month: month)
        templates = TemplatesViewModel(api: api, month: month.month)
        summary = SummaryViewModel(api: api, month: month, defaults: defaults, today: { CalendarDate.today() })
        yearly = YearlyViewModel(api: api, today: today)
        trends = TrendsViewModel(api: api, defaults: defaults, today: { CalendarDate.today() })
        importTracker = ImportTracker(api: api, source: importEvents, notifier: notifier)
        importer = ImportViewModel(api: api, tracker: importTracker)
        // Entries appear as batches land, so what is on screen is stale once the import ends.
        importTracker.onFinished = { [summary, transactions] _ in
            Task {
                await summary.reload()
                await transactions.reload()
            }
        }
    }
}

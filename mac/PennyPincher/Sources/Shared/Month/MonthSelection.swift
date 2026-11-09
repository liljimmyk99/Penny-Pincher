import Foundation
import Observation

/// The month that Add entries and Transactions show, shared so switching
/// screens keeps it (the web app keeps it in `?month=`). View ▸ Previous and
/// Next Month change it.
@MainActor
@Observable
final class MonthSelection {
    var month: String

    init(month: String) {
        self.month = month
    }

    var title: String { CalendarDate.monthTitle(month) }
    var previousTitle: String { CalendarDate.monthTitle(CalendarDate.shiftMonth(month, by: -1)) }
    var nextTitle: String { CalendarDate.monthTitle(CalendarDate.shiftMonth(month, by: 1)) }

    func previous() { month = CalendarDate.shiftMonth(month, by: -1) }
    func next() { month = CalendarDate.shiftMonth(month, by: 1) }
}

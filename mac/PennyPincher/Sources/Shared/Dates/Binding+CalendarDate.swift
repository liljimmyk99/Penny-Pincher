import SwiftUI

extension Binding where Value == String {
    /// A `YYYY-MM-DD` string as the `Date` a `DatePicker` edits, on the local calendar.
    var calendarDate: Binding<Date> {
        Binding<Date>(
            get: { CalendarDate.date(from: wrappedValue) },
            set: { wrappedValue = CalendarDate.string(from: $0) }
        )
    }
}

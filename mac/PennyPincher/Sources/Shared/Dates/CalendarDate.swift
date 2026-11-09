import Foundation

/// Calendar dates are `YYYY-MM-DD` strings and months `YYYY-MM` (mac/AGENTS.md:
/// time zones must never shift them). Arithmetic works on the numbers; display
/// names come from a Gregorian calendar pinned to UTC, so a date always shows
/// as the day it is. Matches `web/src/lib/dates.ts`.
enum CalendarDate {
    private static let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return calendar
    }()

    /// Today's local calendar date.
    static func today(now: Date = .now, calendar: Calendar = .current) -> String {
        string(from: now, calendar: calendar)
    }

    /// The local calendar date of a `Date` (what a `DatePicker` returns).
    static func string(from date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return "\(parts.year ?? 2000)-\(pad(parts.month ?? 1))-\(pad(parts.day ?? 1))"
    }

    /// Noon on that local calendar day, for a `DatePicker`.
    static func date(from string: String, calendar: Calendar = .current) -> Date {
        let (year, month, day) = parts(string)
        let components = DateComponents(year: year, month: month, day: day, hour: 12)
        return calendar.date(from: components) ?? .now
    }

    /// A real calendar date (rejects 2026-02-30).
    static func isValid(_ value: String) -> Bool {
        guard value.wholeMatch(of: /\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])/) != nil else { return false }
        let (year, month, day) = parts(value)
        return day <= daysInMonth(year: year, month: month)
    }

    static func isMonth(_ value: String) -> Bool {
        value.wholeMatch(of: /\d{4}-(0[1-9]|1[0-2])/) != nil
    }

    /// `"2026-10-03"` → `"2026-10"`.
    static func month(of date: String) -> String { String(date.prefix(7)) }

    static func year(of dateOrMonth: String) -> Int { Int(dateOrMonth.prefix(4)) ?? 2000 }

    static func daysInMonth(year: Int, month: Int) -> Int {
        switch month {
        case 2: (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 ? 29 : 28
        case 4, 6, 9, 11: 30
        default: 31
        }
    }

    /// `"2026-01"` shifted by -1 is `"2025-12"`.
    static func shiftMonth(_ month: String, by offset: Int) -> String {
        let (year, number, _) = parts(month + "-01")
        let index = year * 12 + (number - 1) + offset
        let shiftedYear = index >= 0 ? index / 12 : (index - 11) / 12
        return "\(shiftedYear)-\(pad(index - shiftedYear * 12 + 1))"
    }

    /// First and last calendar date of a month.
    static func bounds(of month: String) -> (first: String, last: String) {
        let (year, number, _) = parts(month + "-01")
        return ("\(month)-01", "\(month)-\(pad(daysInMonth(year: year, month: number)))")
    }

    /// Where a new entry lands by default: today in the current month, else the 1st.
    static func defaultDate(for month: String, today: String) -> String {
        Self.month(of: today) == month ? today : "\(month)-01"
    }

    /// `"2026-03-01"` plus -1 day is `"2026-02-28"`.
    static func addDays(_ date: String, _ days: Int) -> String {
        let (year, month, day) = parts(date)
        guard let start = utc.date(from: DateComponents(year: year, month: month, day: day)),
              let shifted = utc.date(byAdding: .day, value: days, to: start) else { return date }
        return string(from: shifted, calendar: utc)
    }

    // MARK: Display

    /// `"2026-10"` → `"October 2026"`.
    static func monthTitle(_ month: String) -> String {
        format(month + "-01", "MMMMyyyy")
    }

    /// `"2026-10"` → `"October"`.
    static func monthName(_ month: String) -> String {
        format(month + "-01", "MMMM")
    }

    /// `"2026-10-03"` → `"Oct 3"`.
    static func shortDate(_ date: String) -> String {
        format(date, "MMMd")
    }

    private static func format(_ date: String, _ template: String) -> String {
        let (year, month, day) = parts(date)
        guard let value = utc.date(from: DateComponents(year: year, month: month, day: day, hour: 12)) else { return date }
        let formatter = DateFormatter()
        formatter.calendar = utc
        formatter.timeZone = utc.timeZone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: value)
    }

    private static func parts(_ date: String) -> (Int, Int, Int) {
        let numbers = date.split(separator: "-").compactMap { Int($0) }
        guard numbers.count == 3 else { return (2000, 1, 1) }
        return (numbers[0], numbers[1], numbers[2])
    }

    private static func pad(_ value: Int) -> String { value < 10 ? "0\(value)" : "\(value)" }
}

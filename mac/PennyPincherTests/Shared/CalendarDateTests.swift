import Foundation
import Testing
@testable import PennyPincher

@Suite("Calendar dates")
struct CalendarDateTests {
    @Test("Validates real calendar dates", arguments: [
        ("2026-02-28", true), ("2026-02-29", false), ("2028-02-29", true), ("2026-04-31", false),
        ("2026-13-01", false), ("26-01-01", false), ("2026-12-31", true),
    ])
    func valid(date: String, expected: Bool) {
        #expect(CalendarDate.isValid(date) == expected)
    }

    @Test("Shifts months across years")
    func shift() {
        #expect(CalendarDate.shiftMonth("2026-01", by: -1) == "2025-12")
        #expect(CalendarDate.shiftMonth("2026-12", by: 1) == "2027-01")
        #expect(CalendarDate.shiftMonth("2026-05", by: -17) == "2024-12")
    }

    @Test("Adds days without a time zone")
    func addDays() {
        #expect(CalendarDate.addDays("2026-03-01", -1) == "2026-02-28")
        #expect(CalendarDate.addDays("2026-01-15", -90) == "2025-10-17")
    }

    @Test("Bounds and default dates")
    func bounds() {
        #expect(CalendarDate.bounds(of: "2028-02") == ("2028-02-01", "2028-02-29"))
        #expect(CalendarDate.defaultDate(for: "2026-10", today: "2026-10-14") == "2026-10-14")
        #expect(CalendarDate.defaultDate(for: "2026-09", today: "2026-10-14") == "2026-09-01")
    }

    @Test("Round-trips through a DatePicker's Date in any time zone", arguments: ["UTC", "Pacific/Kiritimati", "America/Adak"])
    func roundTrip(zone: String) throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: zone))
        let date = CalendarDate.date(from: "2026-03-08", calendar: calendar)
        #expect(CalendarDate.string(from: date, calendar: calendar) == "2026-03-08")
    }

    @Test("Display names")
    func display() {
        #expect(CalendarDate.monthTitle("2026-10") == "October 2026")
        #expect(CalendarDate.monthName("2026-03") == "March")
        #expect(CalendarDate.shortDate("2026-10-03") == "Oct 3")
    }
}

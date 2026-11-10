/// A row of By category's month-by-month table. Months after today show "—".
struct CategoryTrendRow: Identifiable, Equatable {
    /// The month's index as text, "0" for January.
    var id: String
    var monthName: String
    var spendText: String
    var previousMonthChange: ChangeText?
    var lastYearText: String
    var lastYearChange: ChangeText?
    var yearToDateText: String
    var isFuture: Bool
}

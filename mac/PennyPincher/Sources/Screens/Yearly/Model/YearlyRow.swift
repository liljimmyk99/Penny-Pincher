/// A row of the month-by-month table (or its total and average footers).
/// Months without entries show "—".
struct YearlyRow: Identifiable, Equatable {
    /// `YYYY-MM`, or "total" / "average".
    var id: String
    var title: String
    var netText: String
    var spentText: String
    var leftOverText: String
    var leftOverCents: Int
    var hasEntries: Bool
}

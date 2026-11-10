/// A saved trend in the list: its name, what it matches and the measure, with
/// a sparkline of the last twelve months.
struct SavedTrendRow: Identifiable, Equatable {
    var id: String
    var name: String
    /// "Merchant: Corner Market · Amount".
    var detail: String
    /// One value per month, oldest first; empty until loaded.
    var values: [Int]
    var accessibilityLabel: String
}

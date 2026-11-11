/// One month of a custom trend's bars.
struct TrendBarItem: Identifiable, Equatable {
    /// `YYYY-MM`.
    var id: String
    /// "Oct".
    var label: String
    var value: Int
    var accessibilityLabel: String
}

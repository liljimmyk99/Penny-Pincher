/// One month's income-vs-spent pair in the Yearly chart.
struct PairedBarItem: Identifiable, Equatable {
    /// `YYYY-MM`.
    var id: String
    /// "Jan".
    var label: String
    var netCents: Int
    var spentCents: Int
    var accessibilityLabel: String
}

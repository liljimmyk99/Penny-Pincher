/// One month of the this-year vs. last-year paired bars.
struct YearPairItem: Identifiable, Equatable {
    /// The month's index as text, "0" for January.
    var id: String
    /// "Jan".
    var label: String
    var thisYearCents: Int
    var lastYearCents: Int
    var accessibilityLabel: String
}

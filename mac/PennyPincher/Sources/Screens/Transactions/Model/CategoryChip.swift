/// A category with entries this month: its filter chip and its line under
/// Spending by category.
struct CategoryChip: Identifiable, Equatable {
    var id: String
    var name: String
    var count: Int
    var totalCents: Int
    var totalText: String
    /// Of the month's spending after refunds, "34%"; "—" when nothing was spent.
    var shareText: String
    /// Bar length, 0…1 of the largest category; zero or less gets no bar.
    var barFraction: Double
    var isSaving: Bool
    var isSelected: Bool
}

/// `CategoryTrends`: twelve monthly totals for `year` and for `year - 1`, for
/// every category and for all spending (Saving included). Every comparison is
/// computed in the client.
struct CategoryTrends: Equatable, Sendable {
    struct Series: Equatable, Sendable {
        /// Nil for the "all spending" series.
        var categoryID: String?
        var name: String
        var color: String?
        /// When true an increase is better (blue), not worse (orange).
        var isSaving: Bool
        /// Index 0 is January of `year`; always 12 values.
        var thisYearCents: [Int]
        /// Index 0 is January of `year - 1`; index 11 is the December January compares with.
        var lastYearCents: [Int]
    }

    var year: Int
    var allSpending: Series
    /// Every category, in the user's order.
    var categories: [Series]
}

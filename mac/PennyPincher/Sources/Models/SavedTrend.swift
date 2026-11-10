/// A saved custom trend (`SavedTrend`). Exactly one of `merchantID`,
/// `categoryID` and `matchText` is set, matching `matchType`. Deleting the
/// matched merchant or category deletes the trend.
struct SavedTrend: Identifiable, Equatable, Hashable, Sendable {
    enum MatchType: String, CaseIterable, Identifiable, Equatable, Hashable, Sendable {
        case merchant
        case category
        case note

        var id: String { rawValue }
    }

    var id: String
    var name: String
    var matchType: MatchType
    var merchantID: String?
    var categoryID: String?
    var matchText: String?
    var measure: TrendMeasure
    var sortOrder: Int

    /// Does this expense or refund belong to the trend? Mirrors the API's
    /// filter (note text is matched case-insensitively as a substring).
    func matches(_ expense: Expense) -> Bool {
        switch matchType {
        case .merchant: expense.merchant.id == merchantID
        case .category: expense.categoryID == categoryID
        case .note:
            (expense.note ?? "").localizedLowercase.contains((matchText ?? "").localizedLowercase)
        }
    }

    /// The custom-trend filter for this trend over a date range.
    func query(from: String, to: String) -> CustomTrendQuery {
        CustomTrendQuery(categoryID: matchType == .category ? categoryID : nil,
                         merchantID: matchType == .merchant ? merchantID : nil,
                         text: matchType == .note ? matchText : nil, from: from, to: to)
    }
}

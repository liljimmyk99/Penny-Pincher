/// A category's change against the same month last year, for Biggest movers.
struct TrendMover: Equatable {
    var series: CategoryTrends.Series
    var deltaCents: Int
    var tone: ChangeTone

    /// Every category that changed in that month, biggest change first (web `biggestMovers`).
    static func ranked(_ categories: [CategoryTrends.Series], index: Int) -> [TrendMover] {
        categories
            .map { series in
                let delta = series.thisYearCents[index] - series.lastYearCents[index]
                return TrendMover(series: series, deltaCents: delta,
                                  tone: ChangeTone.of(deltaCents: delta, isSaving: series.isSaving))
            }
            .filter { $0.deltaCents != 0 }
            .enumerated()
            .sorted { lhs, rhs in
                let (a, b) = (lhs.element.deltaCents.magnitude, rhs.element.deltaCents.magnitude)
                return a != b ? a > b : lhs.offset < rhs.offset
            }
            .map { $0.element }
    }
}

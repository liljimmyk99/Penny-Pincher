/// One series' figures for one month of By category (web `monthFigures`).
/// All integer cents; `index` 0 is January.
struct TrendMonthFigures: Equatable {
    var spend: Int
    /// The previous month; January compares with last year's December.
    var previousMonth: Int
    var sameMonthLastYear: Int
    var yearToDate: Int
    var yearToDateLastYear: Int

    init(series: CategoryTrends.Series, index: Int) {
        let this = series.thisYearCents
        let last = series.lastYearCents
        spend = this[index]
        previousMonth = index == 0 ? last[11] : this[index - 1]
        sameMonthLastYear = last[index]
        yearToDate = this[...index].reduce(0, +)
        yearToDateLastYear = last[...index].reduce(0, +)
    }
}

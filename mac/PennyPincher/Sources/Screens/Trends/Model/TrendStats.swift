/// The figures over a custom trend's months (web `trendStats`), in the chosen
/// measure: cents for an amount, a number of expenses for a count.
struct TrendStats: Equatable {
    /// Total for the calendar year of the current month.
    var yearToDate: Int
    /// Mean per month from the first month with a match through the current month.
    var monthlyAverage: Int
    /// The current month and the one before it, for the change indicator.
    var current: Int
    var previous: Int
    /// The largest month above zero, if any.
    var peakPeriod: String?
    var peakValue: Int
    /// Net spent ÷ number of expenses, in cents; nil when there were none.
    var perVisitCents: Int?
    /// The first month in the range with a match.
    var since: String?

    init(buckets: [TrendBucket], measure: TrendMeasure, currentMonth: String) {
        let year = String(currentMonth.prefix(4))
        let values = buckets.map { $0.value(measure) }
        let firstHit = buckets.firstIndex(where: \.hasMatches)
        let tracked = firstHit.map { Array(values[$0...]) } ?? []

        yearToDate = zip(buckets, values).filter { $0.0.period.hasPrefix(year) }.reduce(0) { $0 + $1.1 }
        monthlyAverage = Self.average(tracked.reduce(0, +), count: tracked.count)
        func at(_ month: String) -> Int {
            buckets.firstIndex { $0.period == month }.map { values[$0] } ?? 0
        }
        current = at(currentMonth)
        previous = at(CalendarDate.shiftMonth(currentMonth, by: -1))

        var peak: (period: String, value: Int)?
        for (bucket, value) in zip(buckets, values) where value > 0 && value > (peak?.value ?? 0) {
            peak = (bucket.period, value)
        }
        peakPeriod = peak?.period
        peakValue = peak?.value ?? 0

        let visits = buckets.reduce(0) { $0 + $1.count }
        let totalCents = buckets.reduce(0) { $0 + $1.totalCents }
        perVisitCents = visits > 0 ? Self.average(totalCents, count: visits) : nil
        since = firstHit.map { buckets[$0].period }
    }

    /// `total ÷ count` in integers, rounded half away from zero; 0 when there is nothing to divide by.
    static func average(_ total: Int, count: Int) -> Int {
        guard count > 0 else { return 0 }
        let half = count / 2
        return (total >= 0 ? total + half : total - half) / count
    }
}

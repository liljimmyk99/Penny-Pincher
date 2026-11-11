/// One month of a custom trend (`CustomTrend.buckets`), zero-filled.
/// `totalCents` is net of refunds; `count` counts expenses only.
struct TrendBucket: Identifiable, Equatable, Sendable {
    /// `YYYY-MM`.
    var period: String
    var totalCents: Int
    var count: Int

    var id: String { period }

    func value(_ measure: TrendMeasure) -> Int {
        measure == .count ? count : totalCents
    }

    var hasMatches: Bool { totalCents != 0 || count != 0 }
}

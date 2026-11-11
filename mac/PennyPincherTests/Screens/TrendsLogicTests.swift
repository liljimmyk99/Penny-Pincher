import Foundation
import SwiftUI
import Testing
@testable import PennyPincher

@Suite("Trends: figures, changes and movers")
struct TrendsLogicTests {
    static func bucket(_ period: String, _ cents: Int, _ count: Int) -> TrendBucket {
        TrendBucket(period: period, totalCents: cents, count: count)
    }

    static let buckets = [bucket("2025-11", 0, 0), bucket("2025-12", 3_000, 2), bucket("2026-01", 0, 0),
                          bucket("2026-02", 5_000, 1), bucket("2026-03", -1_000, 1)]

    @Test("Amount figures: year to date, average since the first match, peak and per visit")
    func amountStats() {
        let stats = TrendStats(buckets: Self.buckets, measure: .amount, currentMonth: "2026-03")
        #expect(stats.yearToDate == 4_000)
        #expect(stats.monthlyAverage == 1_750)
        #expect(stats.current == -1_000 && stats.previous == 5_000)
        #expect(stats.peakPeriod == "2026-02" && stats.peakValue == 5_000)
        #expect(stats.perVisitCents == 1_750)
        #expect(stats.since == "2025-12")
    }

    @Test("Count figures use the number of expenses; per visit stays in cents")
    func countStats() {
        let stats = TrendStats(buckets: Self.buckets, measure: .count, currentMonth: "2026-03")
        #expect(stats.yearToDate == 2)
        #expect(stats.monthlyAverage == 1)
        #expect(stats.current == 1 && stats.previous == 1)
        #expect(stats.peakPeriod == "2025-12" && stats.peakValue == 2)
        #expect(stats.perVisitCents == 1_750)
    }

    @Test("A trend with no matches has no peak, no per-visit figure and no start")
    func noMatches() {
        let stats = TrendStats(buckets: [Self.bucket("2026-02", 0, 0), Self.bucket("2026-03", 0, 0)],
                               measure: .amount, currentMonth: "2026-03")
        #expect(stats.peakPeriod == nil && stats.perVisitCents == nil && stats.since == nil)
        #expect(stats.monthlyAverage == 0 && stats.yearToDate == 0)
    }

    @Test("Averages round half away from zero", arguments: [(5, 2, 3), (-5, 2, -3), (7, 3, 2), (8_000, 3, 2_667), (9, 0, 0)])
    func average(total: Int, count: Int, expected: Int) {
        #expect(TrendStats.average(total, count: count) == expected)
    }

    // MARK: Change indicators

    @Test("Spending more is worse (orange), less is better (blue), with arrow, sign and percent")
    func spendingChange() {
        let up = ChangeText(change: Change(current: 11_000, previous: 10_000), suffix: "vs. last month")
        #expect(up.tone == .worse)
        #expect(up.text == "▲ +$10.00 (+10%)")
        #expect(up.words == "Worse: +$10.00 (+10%) vs. last month")
        #expect(up.tone.color == .brand)

        let down = ChangeText(change: Change(current: 9_000, previous: 10_000), suffix: "vs. last month")
        #expect(down.tone == .better)
        #expect(down.text == "▼ −$10.00 (−10%)")
        #expect(down.tone.color == .brandPrimary)
    }

    @Test("For Saving the colours flip: saving more is better, saving less is worse")
    func savingFlip() {
        let more = ChangeText(change: Change(current: 11_000, previous: 10_000, isSaving: true), suffix: "vs. last month")
        #expect(more.tone == .better)
        #expect(more.text == "▲ +$10.00 (+10%)")
        #expect(more.words == "Better: +$10.00 (+10%) vs. last month")
        let less = ChangeText(change: Change(current: 9_000, previous: 10_000, isSaving: true), suffix: "vs. last month")
        #expect(less.tone == .worse)
        #expect(less.text.hasPrefix("▼ −"))
    }

    @Test("No change says so, in a neutral colour")
    func noChange() {
        let same = ChangeText(change: Change(current: 500, previous: 500), suffix: "vs. last month")
        #expect(same.tone == .none)
        #expect(same.text == "No change")
        #expect(same.words == "No change vs. last month")
        #expect(same.tone.color == .secondary)
    }

    @Test("A count changes by whole numbers, never flipped and without a percent")
    func countChange() {
        let up = ChangeText(current: 5, previous: 3, measure: .count, suffix: "this month vs. last")
        #expect(up.tone == .worse && up.text == "▲ +2")
        let down = ChangeText(current: 3, previous: 5, measure: .count, suffix: "this month vs. last")
        #expect(down.tone == .better && down.text == "▼ −2")
        let amount = ChangeText(current: 3_000, previous: 5_000, measure: .amount, suffix: "this month vs. last")
        #expect(amount.text == "▼ −$20.00")
    }

    // MARK: By category

    static func series(_ id: String?, _ name: String, saving: Bool = false, this: [Int], last: [Int]) -> CategoryTrends.Series {
        CategoryTrends.Series(categoryID: id, name: name, color: nil, isSaving: saving, thisYearCents: this, lastYearCents: last)
    }

    @Test("January compares with last December; year to date sums through the month")
    func monthFigures() {
        let s = Self.series("c", "Food", this: (1...12).map { $0 * 100 }, last: (1...12).map { $0 * 10 })
        let january = TrendMonthFigures(series: s, index: 0)
        #expect(january.spend == 100 && january.previousMonth == 120 && january.sameMonthLastYear == 10)
        #expect(january.yearToDate == 100 && january.yearToDateLastYear == 10)
        let march = TrendMonthFigures(series: s, index: 2)
        #expect(march.previousMonth == 200 && march.sameMonthLastYear == 30)
        #expect(march.yearToDate == 600 && march.yearToDateLastYear == 60)
    }

    @Test("Biggest movers rank by size of change, skip unchanged categories and flip Saving")
    func movers() {
        func months(_ january: Int) -> [Int] { [january] + Array(repeating: 0, count: 11) }
        let categories = [
            Self.series("a", "Food", this: months(500), last: months(200)),
            Self.series("b", "Saving", saving: true, this: months(100), last: months(400)),
            Self.series("c", "Fun", this: months(50), last: months(50)),
            Self.series("d", "Travel", this: months(0), last: months(50)),
        ]
        let ranked = TrendMover.ranked(categories, index: 0)
        #expect(ranked.map(\.series.name) == ["Food", "Saving", "Travel"])
        #expect(ranked.map(\.deltaCents) == [300, -300, -50])
        #expect(ranked.map(\.tone) == [.worse, .worse, .better])
    }

    // MARK: Matching

    @Test("A trend matches its merchant, its category, or note text case-insensitively")
    func matching() {
        let expense = Fixture.expense("e1", "2026-03-02", 1_000, category: Fixture.food.id, merchant: Fixture.store,
                                      note: "Weekly shop")
        func trend(_ type: SavedTrend.MatchType, merchant: String? = nil, category: String? = nil, text: String? = nil) -> SavedTrend {
            SavedTrend(id: "t", name: "T", matchType: type, merchantID: merchant, categoryID: category, matchText: text,
                       measure: .amount, sortOrder: 0)
        }
        #expect(trend(.merchant, merchant: Fixture.store.id).matches(expense))
        #expect(!trend(.merchant, merchant: Fixture.cafe.id).matches(expense))
        #expect(trend(.category, category: Fixture.food.id).matches(expense))
        #expect(trend(.note, text: "WEEKLY").matches(expense))
        #expect(!trend(.note, text: "monthly").matches(expense))

        let query = trend(.note, merchant: "stray", text: "weekly").query(from: "2025-04-01", to: "2026-03-31")
        #expect(query == CustomTrendQuery(categoryID: nil, merchantID: nil, text: "weekly", from: "2025-04-01", to: "2026-03-31"))
    }

    @Test("Trends chart the last twelve months, the current one included")
    func range() {
        let range = CustomTrendsViewModel.range(currentMonth: "2026-03")
        #expect(range.from == "2025-04-01" && range.to == "2026-03-31")
    }
}

import Foundation
import Observation
import SwiftUI

/// Trends ▸ By category (web/AGENTS.md "Trends"): for all spending or one
/// category, the selected month's figures vs. last month and vs. the same
/// month last year, this year vs. last year per month, biggest movers, and the
/// month-by-month change table. Every comparison is computed here from the
/// API's twelve-plus-twelve monthly totals. Saving's colours flip.
@MainActor
@Observable
final class CategoryTrendsViewModel {
    static let minYear = 2000
    static let maxYear = 2100

    private(set) var phase: LoadPhase = .loading
    private(set) var trends: CategoryTrends?
    var year: Int
    /// Nil charts all spending.
    var selectedCategoryID: String?
    /// The selected month, 0 for January.
    var monthIndex: Int

    @ObservationIgnored private let api: TrendsAPI
    @ObservationIgnored private let today: @MainActor () -> String

    init(api: TrendsAPI, today: @escaping @MainActor () -> String = { CalendarDate.today() }) {
        self.api = api
        self.today = today
        let date = today()
        year = CalendarDate.year(of: date)
        monthIndex = Self.defaultMonthIndex(year: CalendarDate.year(of: date), today: date)
    }

    /// The current month in the current year, else December.
    static func defaultMonthIndex(year: Int, today: String) -> Int {
        CalendarDate.year(of: today) == year ? (Int(today.dropFirst(5).prefix(2)) ?? 1) - 1 : 11
    }

    // MARK: Loading

    func load() async {
        await fetch(showFailure: trends == nil)
    }

    /// A different year starts again from all spending and its default month.
    func yearChanged() async {
        selectedCategoryID = nil
        monthIndex = Self.defaultMonthIndex(year: year, today: today())
        await fetch(showFailure: trends == nil)
    }

    private func fetch(showFailure: Bool) async {
        let requested = year
        if showFailure { phase = .loading }
        do throws(APIError) {
            let found = try await api.categoryTrends(year: requested)
            guard requested == year else { return }
            trends = found
            if let id = selectedCategoryID, !found.categories.contains(where: { $0.categoryID == id }) {
                selectedCategoryID = nil
            }
            phase = .loaded
        } catch {
            if showFailure { phase = .failed(error.message) }
        }
    }

    var canGoToPreviousYear: Bool { year > Self.minYear }
    var canGoToNextYear: Bool { year < Self.maxYear }

    func previousYear() {
        if canGoToPreviousYear { year -= 1 }
    }

    func nextYear() {
        if canGoToNextYear { year += 1 }
    }

    var yearTitle: String { String(year) }
    var previousYearTitle: String { String(year - 1) }
    var nextYearTitle: String { String(year + 1) }

    /// The year the loaded data is for (the switcher may already show the next one).
    private var dataYear: Int { trends?.year ?? year }
    private var lastYearTitle: String { String(dataYear - 1) }

    // MARK: Selection

    var options: [TrendCategoryOption] {
        guard let trends else { return [] }
        return [TrendCategoryOption(categoryID: nil, name: String(localized: "trends.category.all"), isSaving: false)]
            + trends.categories.compactMap { series in
                series.categoryID.map { TrendCategoryOption(categoryID: $0, name: series.name, isSaving: series.isSaving) }
            }
    }

    var series: CategoryTrends.Series? {
        guard let trends else { return nil }
        guard let id = selectedCategoryID else { return trends.allSpending }
        return trends.categories.first { $0.categoryID == id } ?? trends.allSpending
    }

    /// "All spending" (from this app, not the API's name) or the category's name.
    var seriesName: String {
        guard selectedCategoryID != nil, let series else { return String(localized: "trends.category.all") }
        return series.name
    }

    /// Clicking a mover charts it; clicking it again goes back to all spending.
    func toggleCategory(_ id: String) {
        selectedCategoryID = selectedCategoryID == id ? nil : id
    }

    func selectMonth(_ index: Int) {
        if (0..<12).contains(index) { monthIndex = index }
    }

    /// The table's selection, as the month's index in text.
    var selectedRowID: String? {
        get { String(monthIndex) }
        set { if let index = newValue.flatMap({ Int($0) }) { selectMonth(index) } }
    }

    static func fullMonthName(_ index: Int) -> String {
        CalendarDate.monthName("2000-\(index < 9 ? "0" : "")\(index + 1)")
    }

    static func shortMonthName(_ index: Int) -> String {
        CalendarDate.shortMonthName("2000-\(index < 9 ? "0" : "")\(index + 1)")
    }

    var monthName: String { Self.fullMonthName(monthIndex) }

    // MARK: Figures

    private var figures: TrendMonthFigures? { series.map { TrendMonthFigures(series: $0, index: monthIndex) } }
    private var isSaving: Bool { series?.isSaving ?? false }

    private func change(_ current: Int, _ previous: Int, suffix: String) -> ChangeText {
        ChangeText(change: Change(current: current, previous: previous, isSaving: isSaving), suffix: suffix)
    }

    private func previousMonthSuffix(_ index: Int) -> String {
        index == 0 ? String(localized: "trends.vsLastDecember") : String(localized: "trends.vsLastMonth")
    }

    private func lastYearSuffix(_ index: Int) -> String {
        String(localized: "trends.vsMonthYear \(Self.fullMonthName(index)) \(lastYearTitle)")
    }

    var tiles: [TrendTile] {
        guard let figures else { return [] }
        let tint: Color = isSaving ? .saving : .primary
        return [
            TrendTile(id: "spend", title: String(localized: "trends.category.tile.spend \(monthName)"),
                      valueText: Money.format(figures.spend), tint: tint, caption: seriesName),
            TrendTile(id: "month", title: String(localized: "trends.category.tile.previous"),
                      valueText: Money.format(figures.previousMonth),
                      change: change(figures.spend, figures.previousMonth, suffix: previousMonthSuffix(monthIndex))),
            TrendTile(id: "year", title: lastYearSuffix(monthIndex),
                      valueText: Money.format(figures.sameMonthLastYear),
                      change: change(figures.spend, figures.sameMonthLastYear, suffix: lastYearSuffix(monthIndex))),
            TrendTile(id: "ytd", title: String(localized: "trends.category.tile.ytd"),
                      valueText: Money.format(figures.yearToDate),
                      change: change(figures.yearToDate, figures.yearToDateLastYear,
                                     suffix: String(localized: "trends.vsLastYearTotal \(Money.format(figures.yearToDateLastYear))"))),
        ]
    }

    var pairsTitle: String { String(localized: "trends.pairs.title \(String(dataYear)) \(lastYearTitle)") }
    var pairsDescription: String { String(localized: "trends.pairs.description \(seriesName)") }
    var thisYearName: String { String(dataYear) }
    var lastYearName: String { lastYearTitle }

    var pairs: [YearPairItem] {
        guard let series else { return [] }
        return (0..<12).map { index in
            let this = series.thisYearCents[index]
            let last = series.lastYearCents[index]
            return YearPairItem(
                id: String(index), label: Self.shortMonthName(index), thisYearCents: this, lastYearCents: last,
                accessibilityLabel: String(localized: "trends.pairs.accessibility \(Self.fullMonthName(index)) \(thisYearName) \(Money.format(this)) \(lastYearName) \(Money.format(last))"))
        }
    }

    var moversDescription: String {
        String(localized: "trends.movers.description \(monthName) \(lastYearSuffix(monthIndex))")
    }

    var movers: [MoverItem] {
        guard let trends else { return [] }
        return TrendMover.ranked(trends.categories, index: monthIndex).compactMap { mover in
            guard let id = mover.series.categoryID else { return nil }
            let change = Change(current: mover.series.thisYearCents[monthIndex],
                                previous: mover.series.lastYearCents[monthIndex], isSaving: mover.series.isSaving)
            let text = ChangeText(change: change, suffix: lastYearSuffix(monthIndex))
            return MoverItem(id: id, name: mover.series.name, deltaCents: mover.deltaCents, tone: mover.tone,
                             isSaving: mover.series.isSaving, changeText: "\(change.arrow) \(change.amountText)",
                             accessibilityLabel: String(localized: "trends.movers.accessibility \(mover.series.name) \(text.words)"))
        }
    }

    var moversEmptyText: String { String(localized: "trends.movers.empty \(monthName)") }

    var tableDescription: String { String(localized: "trends.table.description \(seriesName)") }

    var rows: [CategoryTrendRow] {
        guard let series else { return [] }
        let now = today()
        let currentIndex = CalendarDate.year(of: now) == dataYear ? Self.defaultMonthIndex(year: dataYear, today: now) : 11
        let future = CalendarDate.year(of: now) < dataYear
        return (0..<12).map { index in
            let figures = TrendMonthFigures(series: series, index: index)
            let isFuture = future || index > currentIndex
            return CategoryTrendRow(
                id: String(index), monthName: Self.fullMonthName(index),
                spendText: isFuture ? "—" : Money.format(figures.spend),
                previousMonthChange: isFuture ? nil : change(figures.spend, figures.previousMonth,
                                                             suffix: previousMonthSuffix(index)),
                lastYearText: Money.format(figures.sameMonthLastYear),
                lastYearChange: isFuture ? nil : change(figures.spend, figures.sameMonthLastYear, suffix: lastYearSuffix(index)),
                yearToDateText: isFuture ? "—" : Money.format(figures.yearToDate),
                isFuture: isFuture)
        }
    }

    var lastYearColumnTitle: String { lastYearTitle }
    var lastYearChangeColumnTitle: String { String(localized: "trends.table.vsYear \(lastYearTitle)") }
}

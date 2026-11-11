import Foundation
import Observation
import SwiftUI

/// Trends ▸ Custom trends (web/AGENTS.md "Trends"): the saved trends with
/// sparklines, and the selected one's Amount/Count toggle, figures and bars
/// per month over the last twelve months. Selecting a bar lists that month's
/// matching entries, with "Open in Transactions".
@MainActor
@Observable
final class CustomTrendsViewModel {
    /// How many months a trend is charted over, ending with the current month.
    nonisolated static let monthCount = 12

    private(set) var phase: LoadPhase = .loading
    private(set) var trends: [SavedTrend] = []
    private(set) var merchants: [Merchant] = []
    private(set) var categories: [ExpenseCategory] = []
    /// Each trend's months, by trend id, once loaded.
    private(set) var buckets: [String: [TrendBucket]] = [:]
    /// Why a trend's months couldn't load, by trend id.
    private(set) var bucketErrors: [String: String] = [:]

    var selectedID: String? {
        didSet {
            guard selectedID != oldValue else { return }
            measure = selectedTrend?.measure ?? .amount
            clearMonth()
        }
    }

    /// Starts as the trend's own measure; the toggle changes only what is shown.
    var measure: TrendMeasure = .amount
    /// The month whose bar is selected (`YYYY-MM`).
    private(set) var selectedMonth: String?
    private(set) var entries: [Expense] = []
    private(set) var entriesPhase: LoadPhase = .loaded
    var newTrend: NewTrendViewModel?

    /// Set by the window: show Transactions narrowed to a trend's month.
    @ObservationIgnored var openTransactions: @MainActor (TransactionsLink) -> Void = { _ in }
    @ObservationIgnored private let api: LedgerAPI
    @ObservationIgnored private let today: @MainActor () -> String

    init(api: LedgerAPI, today: @escaping @MainActor () -> String = { CalendarDate.today() }) {
        self.api = api
        self.today = today
    }

    // MARK: Loading

    func load() async {
        let firstLoad = phase != .loaded
        if firstLoad { phase = .loading }
        do throws(APIError) {
            let found = try await api.savedTrends()
            categories = try await api.categories()
            merchants = try await api.allMerchants()
            trends = found
            if !found.contains(where: { $0.id == selectedID }) { selectedID = found.first?.id }
            phase = .loaded
        } catch {
            if firstLoad { phase = .failed(error.message) }
            return
        }
        for trend in trends {
            await loadBuckets(trend)
        }
    }

    /// The selected trend's months again, after they failed.
    func retrySelected() async {
        guard let trend = selectedTrend else { return }
        await loadBuckets(trend)
    }

    private func loadBuckets(_ trend: SavedTrend) async {
        let range = Self.range(currentMonth: currentMonth)
        do throws(APIError) {
            buckets[trend.id] = try await api.customTrend(trend.query(from: range.from, to: range.to))
            bucketErrors[trend.id] = nil
        } catch {
            if buckets[trend.id] == nil { bucketErrors[trend.id] = error.message }
        }
    }

    // MARK: Range

    var currentMonth: String { CalendarDate.month(of: today()) }

    /// The last twelve months, the current one included.
    nonisolated static func range(currentMonth: String) -> (from: String, to: String) {
        (CalendarDate.bounds(of: CalendarDate.shiftMonth(currentMonth, by: 1 - monthCount)).first,
         CalendarDate.bounds(of: currentMonth).last)
    }

    // MARK: List

    var isEmpty: Bool { phase == .loaded && trends.isEmpty }

    var rows: [SavedTrendRow] {
        trends.map { trend in
            let values = (buckets[trend.id] ?? []).map { $0.value(trend.measure) }
            let detail = "\(matchDescription(trend)) · \(String(localized: trend.measure.title))"
            let summary = values.isEmpty ? "" : " " + String(localized: "trends.row.values \(String(values.count)) \(values.map(trend.measure.format).joined(separator: ", "))")
            return SavedTrendRow(id: trend.id, name: trend.name, detail: detail, values: values,
                                 accessibilityLabel: "\(trend.name), \(detail).\(summary)")
        }
    }

    /// "Merchant: Corner Market", "Category: Food" or "Note contains “weekly”".
    func matchDescription(_ trend: SavedTrend) -> String {
        switch trend.matchType {
        case .merchant: String(localized: "trends.match.merchant \(merchantName(trend) ?? "—")")
        case .category: String(localized: "trends.match.category \(categoryName(trend.categoryID) ?? "—")")
        case .note: String(localized: "trends.match.note \(trend.matchText ?? "")")
        }
    }

    private func merchantName(_ trend: SavedTrend) -> String? {
        trend.merchantID.flatMap { id in merchants.first { $0.id == id }?.name }
    }

    private func categoryName(_ id: String?) -> String? {
        id.flatMap { id in categories.first { $0.id == id }?.name }
    }

    // MARK: Selected trend

    var selectedTrend: SavedTrend? { trends.first { $0.id == selectedID } }

    var selectedBuckets: [TrendBucket]? { selectedID.flatMap { buckets[$0] } }

    /// Loading, loaded, or why the selected trend's months couldn't load.
    var detailPhase: LoadPhase {
        guard let selectedID else { return .loaded }
        if buckets[selectedID] != nil { return .loaded }
        return bucketErrors[selectedID].map(LoadPhase.failed) ?? .loading
    }

    var stats: TrendStats? {
        selectedBuckets.map { TrendStats(buckets: $0, measure: measure, currentMonth: currentMonth) }
    }

    /// "Merchant: Corner Market" and "Tracking since March 2026" (or "No matches yet").
    var pills: [String] {
        guard let trend = selectedTrend else { return [] }
        let since = stats?.since.map { String(localized: "trends.since \(CalendarDate.monthTitle($0))") }
            ?? String(localized: "trends.noMatches")
        return [matchDescription(trend), since]
    }

    var tiles: [TrendTile] {
        guard let stats, let buckets = selectedBuckets else { return [] }
        let month = currentMonth
        let change = ChangeText(current: stats.current, previous: stats.previous, measure: measure,
                                suffix: String(localized: "trends.tile.thisMonthVsLast"))
        let noMatches = String(localized: "trends.noMatches")
        return [
            TrendTile(id: "ytd", title: String(localized: "trends.tile.ytd"), valueText: measure.format(stats.yearToDate),
                      caption: String(month.prefix(4))),
            TrendTile(id: "average", title: String(localized: "trends.tile.average"),
                      valueText: measure.format(stats.monthlyAverage),
                      caption: change.tone == .none ? String(localized: "trends.tile.sameAsLast \(CalendarDate.monthName(month))") : nil,
                      change: change.tone == .none ? nil : change),
            TrendTile(id: "peak", title: String(localized: "trends.tile.peak"),
                      valueText: stats.peakPeriod == nil ? "—" : measure.format(stats.peakValue),
                      caption: stats.peakPeriod.map(CalendarDate.monthTitle) ?? noMatches),
            TrendTile(id: "visit", title: String(localized: "trends.tile.perVisit"),
                      valueText: stats.perVisitCents.map { Money.format($0) } ?? "—",
                      caption: String(localized: "trends.tile.lastMonths \(String(buckets.count))")),
        ]
    }

    var chartTitle: String {
        String(localized: "trends.chart.perMonth \(String(localized: measure.title))")
    }

    var bars: [TrendBarItem] {
        (selectedBuckets ?? []).map { bucket in
            let value = bucket.value(measure)
            return TrendBarItem(id: bucket.period, label: CalendarDate.shortMonthName(bucket.period), value: value,
                                accessibilityLabel: String(localized: "trends.bar.accessibility \(CalendarDate.monthTitle(bucket.period)) \(measure.format(value))"))
        }
    }

    // MARK: A month's entries

    /// Selects a bar and lists its matching entries; selecting it again clears it.
    func selectMonth(_ period: String) async {
        guard period != selectedMonth else {
            clearMonth()
            return
        }
        guard let trend = selectedTrend, CalendarDate.isMonth(period) else { return }
        selectedMonth = period
        entries = []
        entriesPhase = .loading
        do throws(APIError) {
            let found = try await api.expenses(ExpenseQuery(month: period))
            guard selectedMonth == period, selectedID == trend.id else { return }
            entries = found.filter(trend.matches)
            entriesPhase = .loaded
        } catch {
            guard selectedMonth == period else { return }
            entriesPhase = .failed(error.message)
        }
    }

    func clearMonth() {
        selectedMonth = nil
        entries = []
        entriesPhase = .loaded
    }

    var entriesTitle: String? {
        selectedMonth.map { String(localized: "trends.entries.title \(CalendarDate.monthTitle($0))") }
    }

    var entriesEmptyText: String? {
        guard let selectedMonth, entriesPhase == .loaded, entries.isEmpty else { return nil }
        return String(localized: "trends.entries.none \(CalendarDate.monthName(selectedMonth))")
    }

    var entryRows: [TrendEntryRow] {
        entries.map { expense in
            var detail = [categoryName(expense.categoryID) ?? "—"]
            if let note = expense.note, !note.isEmpty { detail.append(note) }
            if expense.isRefund { detail.append(String(localized: "trends.entries.refund")) }
            return TrendEntryRow(id: expense.id, dateText: CalendarDate.shortDate(expense.date),
                                 merchant: expense.merchant.name, detail: detail.joined(separator: " · "),
                                 amountText: Money.format(expense.amountCents), isRefund: expense.isRefund)
        }
    }

    /// The selected month in Transactions, narrowed to the trend's matches.
    var transactionsLink: TransactionsLink? {
        guard let month = selectedMonth, let trend = selectedTrend else { return nil }
        switch trend.matchType {
        case .category: return TransactionsLink(month: month, categoryID: trend.categoryID)
        case .merchant: return TransactionsLink(month: month, search: merchantName(trend))
        case .note: return TransactionsLink(month: month, search: trend.matchText)
        }
    }

    func openInTransactions() {
        if let link = transactionsLink { openTransactions(link) }
    }

    // MARK: New trend

    var canCreate: Bool { phase == .loaded }

    func startNewTrend() {
        guard canCreate else { return }
        newTrend = NewTrendViewModel(categories: categories, merchants: merchants, api: api) { [weak self] trend in
            await self?.added(trend)
        }
    }

    private func added(_ trend: SavedTrend) async {
        trends.append(trend)
        selectedID = trend.id
        await loadBuckets(trend)
    }
}

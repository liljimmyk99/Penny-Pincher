import Foundation
import Observation
import SwiftUI

/// Yearly (web/AGENTS.md "Yearly"): year-to-date figures with monthly
/// averages, income vs. spent paired bars, ranked bars of each category's
/// monthly average, and the month-by-month table. Choosing a month opens its
/// Summary.
@MainActor
@Observable
final class YearlyViewModel {
    private(set) var phase: LoadPhase = .loading
    private(set) var summary: YearlySummary?
    var year: Int
    /// A month picked in the table; it opens that month's Summary, then clears.
    var selectedMonth: String?

    /// Set by the window: show that month's Summary.
    @ObservationIgnored var openMonth: @MainActor (String) -> Void = { _ in }
    @ObservationIgnored private let api: SummariesAPI

    init(api: SummariesAPI, today: String = CalendarDate.today()) {
        self.api = api
        year = CalendarDate.year(of: today)
    }

    // MARK: Loading

    func load() async {
        if summary == nil { phase = .loading }
        await fetch(showFailure: true)
    }

    func yearChanged() async {
        await fetch(showFailure: summary == nil)
    }

    private func fetch(showFailure: Bool) async {
        let requested = year
        do throws(APIError) {
            let found = try await api.yearlySummary(year: requested)
            guard requested == year else { return }
            summary = found
            phase = .loaded
        } catch {
            if showFailure { phase = .failed(error.message) }
        }
    }

    func previousYear() { year -= 1 }
    func nextYear() { year += 1 }
    var yearTitle: String { String(year) }
    var previousYearTitle: String { String(year - 1) }
    var nextYearTitle: String { String(year + 1) }

    // MARK: Figures

    /// `total ÷ months with entries`, rounded half away from zero, in integer cents.
    static func averageCents(_ total: Int, months: Int) -> Int {
        guard months > 0 else { return 0 }
        let half = months / 2
        return (total >= 0 ? total + half : total - half) / months
    }

    private func average(_ total: Int) -> Int {
        Self.averageCents(total, months: summary?.averageMonthCount ?? 0)
    }

    var tiles: [FigureTileItem] {
        guard let summary else { return [] }
        let totals = summary.totals
        let muted = summary.averageMonthCount == 0
        func tile(_ id: String, _ title: LocalizedStringKey, _ cents: Int, _ tint: Color) -> FigureTileItem {
            FigureTileItem(id: id, title: title, value: Money.format(cents), tint: muted ? .secondary : tint,
                           detail: String(localized: "yearly.tile.average \(Money.format(average(cents)))"))
        }
        return [
            tile("net", "summary.tile.net", totals.netCents, .income),
            tile("spent", "summary.tile.spent", totals.spentCents, .primary),
            tile("saved", "summary.tile.saved", totals.savingCents, .saving),
            tile("left", "summary.tile.left", totals.leftOverCents, totals.leftOverCents < 0 ? .red : .primary),
        ]
    }

    var pairedBars: [PairedBarItem] {
        (summary?.months ?? []).map { month in
            PairedBarItem(
                id: month.month, label: CalendarDate.shortMonthName(month.month), netCents: month.netCents,
                spentCents: month.spentCents,
                accessibilityLabel: String(localized: "yearly.bar.accessibility \(CalendarDate.monthName(month.month)) \(Money.format(month.netCents)) \(Money.format(month.spentCents))"))
        }
    }

    /// Each category's monthly average, largest first; zero averages are left out.
    var averageItems: [RankedBarItem] {
        guard let summary else { return [] }
        return summary.categories.enumerated()
            .filter { $0.element.monthlyAverageCents != 0 }
            .sorted { $0.element.monthlyAverageCents > $1.element.monthlyAverageCents }
            .map { index, category in
                RankedBarItem(
                    id: category.id, name: category.name, valueCents: category.monthlyAverageCents,
                    color: ChartPalette.color(isSaving: category.isSaving, hex: category.color, index: index),
                    isSaving: category.isSaving, amountText: Money.format(category.monthlyAverageCents),
                    detailText: nil, change: nil,
                    accessibilityLabel: String(localized: "yearly.average.accessibility \(category.name) \(Money.format(category.monthlyAverageCents))"))
            }
    }

    var hasData: Bool { (summary?.averageMonthCount ?? 0) > 0 }

    // MARK: Table

    var rows: [YearlyRow] {
        (summary?.months ?? []).map { month in
            YearlyRow(id: month.month, title: CalendarDate.monthName(month.month),
                      netText: month.hasEntries ? Money.format(month.netCents) : "—",
                      spentText: month.hasEntries ? Money.format(month.spentCents) : "—",
                      leftOverText: month.hasEntries ? Money.format(month.leftOverCents) : "—",
                      leftOverCents: month.leftOverCents, hasEntries: month.hasEntries)
        }
    }

    var totalRow: YearlyRow? {
        summary.map { row("total", String(localized: "yearly.table.total"), $0.totals.netCents, $0.totals.spentCents,
                          $0.totals.leftOverCents) }
    }

    var averageRow: YearlyRow? {
        summary.map {
            row("average", String(localized: "yearly.table.average"), average($0.totals.netCents),
                average($0.totals.spentCents), average($0.totals.leftOverCents))
        }
    }

    private func row(_ id: String, _ title: String, _ net: Int, _ spent: Int, _ left: Int) -> YearlyRow {
        YearlyRow(id: id, title: title, netText: Money.format(net), spentText: Money.format(spent),
                  leftOverText: Money.format(left), leftOverCents: left, hasEntries: true)
    }

    // MARK: Opening a month

    /// Opens that month's Summary (the table row or the chart pair).
    func open(_ month: String) {
        selectedMonth = nil
        guard CalendarDate.isMonth(month) else { return }
        openMonth(month)
    }
}

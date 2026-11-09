import Foundation
import Observation
import SwiftUI

/// Summary (web/AGENTS.md "Summary"): the month's figures, income per source
/// with an entries sheet, spending by category as ranked bars or a donut
/// (selecting a category only highlights it), the unconfirmed banner, the
/// new-month offer and the new-account checklist.
@MainActor
@Observable
final class SummaryViewModel {
    static let categoriesCheckedKey = "welcome.categoriesChecked"
    static let welcomeHiddenKey = "welcome.hidden"

    let month: MonthSelection
    private(set) var phase: LoadPhase = .loading
    private(set) var summary: MonthlySummary?
    var chartMode: ChartMode = .bars
    /// Highlight only: selecting a category shows nothing extra.
    private(set) var highlightedCategoryID: String?
    var incomeDetail: IncomeDetail?
    /// The month's template actions: the new-month offer, apply, reset and Undo.
    @ObservationIgnored let templates: MonthTemplatesViewModel

    private(set) var errorMessage: String?
    private(set) var statusMessage: String?
    private(set) var isWorking = false
    private(set) var welcomeHidden: Bool
    private(set) var categoriesChecked: Bool

    /// Set by the window: another screen to show (Add entries, Categories, …).
    @ObservationIgnored var navigate: @MainActor (SidebarItem) -> Void = { _ in }
    /// Set by the window: Transactions narrowed to the unconfirmed entries.
    @ObservationIgnored var review: @MainActor () -> Void = {}

    @ObservationIgnored private let api: LedgerAPI
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let today: @MainActor () -> String

    init(api: LedgerAPI, month: MonthSelection, defaults: UserDefaults = .standard,
         today: @escaping @MainActor () -> String = { CalendarDate.today() }) {
        self.api = api
        self.month = month
        self.defaults = defaults
        self.today = today
        welcomeHidden = defaults.bool(forKey: Self.welcomeHiddenKey)
        categoriesChecked = defaults.bool(forKey: Self.categoriesCheckedKey)
        templates = MonthTemplatesViewModel(api: api, month: month)
        templates.counts = { [weak self] in
            let categories = self?.summary?.categories ?? []
            return MonthCounts(expenses: categories.reduce(0) { $0 + $1.expenseCount + $1.refundCount },
                               income: self?.summary?.combined.entryCount ?? 0)
        }
        templates.onChange = { [weak self] in await self?.reload() }
    }

    // MARK: Loading

    func load() async {
        if summary == nil { phase = .loading }
        do throws(APIError) {
            try await loadMonth()
            phase = .loaded
        } catch {
            phase = .failed(error.message)
            return
        }
        await templates.load()
    }

    func monthChanged() async {
        highlightedCategoryID = nil
        incomeDetail = nil
        statusMessage = nil
        do throws(APIError) {
            try await loadMonth()
            errorMessage = nil
        } catch {
            errorMessage = error.message
        }
        await templates.monthChanged()
    }

    func reload() async {
        do throws(APIError) {
            try await loadMonth()
        } catch {
            errorMessage = error.message
        }
    }

    // MARK: Figures

    var isEmpty: Bool { summary?.isEmpty ?? true }

    var tiles: [SummaryTile] {
        guard let summary else { return [] }
        let muted = summary.isEmpty
        func tint(_ color: Color) -> Color { muted ? .secondary : color }
        return [
            SummaryTile(id: "net", title: "summary.tile.net", valueText: Money.format(summary.combined.netCents),
                        tint: tint(.income)),
            SummaryTile(id: "spent", title: "summary.tile.spent", valueText: Money.format(summary.totalCents),
                        tint: tint(.primary),
                        change: muted ? nil : Change(current: summary.totalCents, previous: summary.previousMonthTotalCents)),
            SummaryTile(id: "saved", title: "summary.tile.saved", valueText: Money.format(summary.savingCents),
                        tint: tint(.saving), detail: "summary.tile.savedDetail",
                        change: muted ? nil : Change(current: summary.savingCents, previous: summary.previousSavingCents,
                                                     isSaving: true)),
            SummaryTile(id: "left", title: "summary.tile.left", valueText: Money.format(summary.leftOverCents),
                        tint: muted ? .secondary : (summary.leftOverCents < 0 ? .red : .primary)),
        ]
    }

    // MARK: Income

    /// Sources that have entries this month, in the user's order.
    var incomeRows: [IncomeSourceRow] {
        (summary?.sources ?? []).filter { $0.totals.entryCount > 0 }.map { source in
            IncomeSourceRow(id: source.id, name: source.name, entryCount: source.totals.entryCount,
                            grossText: Money.format(source.totals.grossCents), netText: Money.format(source.totals.netCents),
                            taxRateText: Self.taxRate(source.totals))
        }
    }

    var combinedRow: IncomeSourceRow? {
        guard let summary, summary.combined.entryCount > 0 else { return nil }
        return IncomeSourceRow(id: "combined", name: String(localized: "summary.income.combined"),
                               entryCount: summary.combined.entryCount,
                               grossText: Money.format(summary.combined.grossCents),
                               netText: Money.format(summary.combined.netCents), taxRateText: Self.taxRate(summary.combined))
    }

    /// Opens the sheet with that source's entries for the month.
    func showIncome(_ sourceID: String) async {
        guard let summary, let source = summary.sources.first(where: { $0.id == sourceID }) else { return }
        let current = month.month
        do throws(APIError) {
            let entries = try await api.incomeEntries(month: current)
            guard current == month.month else { return }
            let mine = entries.filter { $0.incomeSourceID == sourceID }.sorted { $0.date > $1.date }
            incomeDetail = IncomeDetail(
                id: sourceID,
                title: source.name,
                rows: mine.map { Self.row($0, source: source.name) },
                total: Self.totalRow(String(localized: "summary.income.total \(source.name)"), source.totals),
                combined: Self.totalRow(String(localized: "summary.income.combined"), summary.combined))
            errorMessage = nil
        } catch {
            errorMessage = error.message
        }
    }

    func closeIncome() {
        incomeDetail = nil
    }

    private static func taxRate(_ totals: IncomeTotals) -> String {
        TaxRate.format(grossTaxableCents: totals.grossTaxableCents, netCents: totals.netCents)
    }

    private static func row(_ entry: IncomeEntry, source: String) -> IncomeRow {
        IncomeRow(id: entry.id, date: entry.date, dateText: CalendarDate.shortDate(entry.date), source: source,
                  label: entry.note ?? "", grossText: Money.format(entry.grossCents),
                  taxableText: Money.format(entry.grossTaxableCents), netText: Money.format(entry.netCents),
                  taxRateText: TaxRate.format(grossTaxableCents: entry.grossTaxableCents, netCents: entry.netCents),
                  isUnconfirmed: !entry.confirmed)
    }

    private static func totalRow(_ title: String, _ totals: IncomeTotals) -> IncomeRow {
        IncomeRow(id: title, date: "", dateText: "", source: title, label: "",
                  grossText: Money.format(totals.grossCents), taxableText: Money.format(totals.grossTaxableCents),
                  netText: Money.format(totals.netCents), taxRateText: taxRate(totals), isUnconfirmed: false)
    }

    // MARK: Spending

    /// Categories with spending this month, largest first. A category that
    /// refunds netted to zero or below gets no bar.
    var rankedItems: [RankedBarItem] {
        guard let summary else { return [] }
        let net = summary.combined.netCents
        return summary.categories.enumerated()
            .filter { $0.element.totalCents > 0 }
            .sorted { $0.element.totalCents > $1.element.totalCents }
            .map { index, category in
                let change = Change(current: category.totalCents, previous: category.previousMonthTotalCents,
                                    isSaving: category.isSaving)
                let share = Percent.share(category.totalCents, of: net)
                return RankedBarItem(
                    id: category.id, name: category.name, valueCents: category.totalCents,
                    color: ChartPalette.color(isSaving: category.isSaving, hex: category.color, index: index),
                    isSaving: category.isSaving, amountText: Money.format(category.totalCents),
                    detailText: net > 0 ? String(localized: "summary.category.share \(share)") : nil,
                    change: change,
                    accessibilityLabel: String(localized: "summary.category.accessibility \(category.name) \(Money.format(category.totalCents)) \(share) \(change.words)"))
            }
    }

    var spendingTotalText: String { Money.format(summary?.totalCents ?? 0) }

    func toggleHighlight(_ id: String) {
        highlightedCategoryID = highlightedCategoryID == id ? nil : id
    }

    // MARK: Banner

    var unconfirmedCount: Int { summary?.unconfirmedCount ?? 0 }

    /// The banner's text: what the newest template copy added, else the plain count.
    var bannerText: String {
        guard let apply = templates.undoableApply else {
            return String(localized: "transactions.unconfirmed.banner \(unconfirmedCount)")
        }
        return String(localized: "transactions.applied.banner \(apply.createdCount) \(apply.templateName ?? "")")
    }

    func reviewUnconfirmed() {
        review()
    }

    func confirmAll() async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do throws(APIError) {
            try await api.confirmAll(month: month.month)
            try await loadMonth()
            await templates.refreshApplies()
            statusMessage = String(localized: "transactions.confirmedAll")
            errorMessage = nil
        } catch {
            errorMessage = error.message
        }
    }

    var noticeMessage: String? { errorMessage ?? templates.errorMessage ?? statusMessage ?? templates.statusMessage }
    var noticeIsError: Bool { errorMessage != nil || templates.errorMessage != nil }

    func dismissMessages() {
        errorMessage = nil
        statusMessage = nil
        templates.dismissMessages()
    }

    // MARK: New month

    /// An empty month offers its template copy (web's `NewMonthOffer`).
    var showsNewMonthOffer: Bool { phase == .loaded && isEmpty && templates.canOffer }

    // MARK: Welcome checklist

    var isCurrentMonth: Bool { month.month == CalendarDate.month(of: today()) }

    var welcomeSteps: [WelcomeStep] {
        [
            WelcomeStep(kind: .categories, title: "summary.welcome.categories.title",
                        detail: "summary.welcome.categories.detail", isDone: categoriesChecked),
            WelcomeStep(kind: .template, title: "summary.welcome.template.title",
                        detail: "summary.welcome.template.detail", isDone: !templates.offerTemplates.isEmpty),
            WelcomeStep(kind: .entry, title: "summary.welcome.entry.title",
                        detail: "summary.welcome.entry.detail", isDone: !isEmpty),
        ]
    }

    /// Only on the current month while it is empty, until all three are done or it is hidden.
    var showsWelcome: Bool {
        phase == .loaded && isCurrentMonth && isEmpty && !welcomeHidden && welcomeSteps.contains { !$0.isDone }
    }

    var welcomeProgressText: String {
        String(localized: "summary.welcome.progress \(welcomeSteps.count { $0.isDone }) \(welcomeSteps.count)")
    }

    func hideWelcome() {
        welcomeHidden = true
        defaults.set(true, forKey: Self.welcomeHiddenKey)
    }

    /// Step 1 is remembered once the person has gone to look.
    func openWelcomeStep(_ kind: WelcomeStep.Kind) {
        switch kind {
        case .categories:
            categoriesChecked = true
            defaults.set(true, forKey: Self.categoriesCheckedKey)
            navigate(.categories)
        case .template:
            navigate(.templates)
        case .entry:
            navigate(.addEntries)
        }
    }

    func addIncome() { navigate(.addEntries) }
    func addExpenses() { navigate(.addEntries) }

    // MARK: Private

    private func loadMonth() async throws(APIError) {
        let current = month.month
        let found = try await api.monthlySummary(month: current)
        guard current == month.month else { return }
        summary = found
    }
}

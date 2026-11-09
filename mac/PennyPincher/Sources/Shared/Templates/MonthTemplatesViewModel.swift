import Foundation
import Observation

/// Starting a month from a template (web/AGENTS.md, Empty states → New month):
/// the offer for an empty month, applying with the full-reset confirmation for
/// a month that has data, and the newest apply's Undo. Shared by Transactions
/// and the Templates screen's Apply sheet.
@MainActor
@Observable
final class MonthTemplatesViewModel {
    let month: MonthSelection
    private(set) var templates: [TemplateSummary] = []
    private(set) var applies: [TemplateApply] = []
    private(set) var categories: [ExpenseCategory] = []
    private(set) var sources: [IncomeSource] = []
    /// The template the offer previews.
    private(set) var preview: Template?
    var selectedTemplateID = ""
    /// "Start blank" hides the offer for this visit only.
    private(set) var startedBlank = false
    var pendingReset: ResetRequest?
    private(set) var isWorking = false
    private(set) var errorMessage: String?
    private(set) var statusMessage: String?

    @ObservationIgnored private let api: LedgerAPI
    /// What the month holds now, for the reset confirmation.
    @ObservationIgnored var counts: @MainActor () async throws(APIError) -> MonthCounts = { MonthCounts(expenses: 0, income: 0) }
    /// Runs after an apply or undo changed the month's entries.
    @ObservationIgnored var onChange: @MainActor () async -> Void = {}

    init(api: LedgerAPI, month: MonthSelection) {
        self.api = api
        self.month = month
    }

    // MARK: Loading

    func load() async {
        do throws(APIError) {
            templates = try await api.templates()
            categories = try await api.categories()
            sources = try await api.incomeSources()
            applies = try await api.templateApplies(month: month.month)
            if !offerTemplates.contains(where: { $0.id == selectedTemplateID }) {
                selectedTemplateID = offerTemplates.first?.id ?? ""
            }
            try await loadPreview()
        } catch {
            errorMessage = error.message
        }
    }

    /// The applies, after the month's entries changed (confirm, edit, delete).
    func refreshApplies() async {
        let current = month.month
        guard let found = try? await api.templateApplies(month: current), current == month.month else { return }
        applies = found
    }

    func monthChanged() async {
        startedBlank = false
        statusMessage = nil
        await refreshApplies()
    }

    // MARK: Offer

    /// Templates worth copying: an empty one has nothing to offer.
    var offerTemplates: [TemplateSummary] { templates.filter { $0.itemCount > 0 } }

    var canOffer: Bool { !startedBlank && !offerTemplates.isEmpty }

    var offerTitle: String { String(localized: "month.offer.title \(month.title)") }
    var copyTitle: String { String(localized: "month.offer.copy \(month.title)") }

    func startBlank() {
        startedBlank = true
    }

    func select(_ id: String) async {
        selectedTemplateID = id
        do throws(APIError) {
            try await loadPreview()
        } catch {
            errorMessage = error.message
        }
    }

    var previewRows: [TemplatePreviewRow] {
        guard let preview else { return [] }
        let income = preview.incomeItems.map { item in
            TemplatePreviewRow(
                id: item.id, day: item.dayOfMonth,
                title: label(sources.first { $0.id == item.incomeSourceID }?.name ?? "", item.note),
                amountText: Money.format(item.netCents), isIncome: true)
        }
        let expenses = preview.expenseItems.map { item in
            TemplatePreviewRow(id: item.id, day: item.dayOfMonth, title: label(item.merchant.name, item.note),
                               amountText: Money.format(item.amountCents), isIncome: false)
        }
        return (income + expenses).sorted { ($0.day, $0.id) < ($1.day, $1.id) }
    }

    var previewTotals: TemplateTotals? {
        preview.map { TemplateTotals($0, categories: categories) }
    }

    /// "<name> · <note>", the way the template editor labels a row.
    private func label(_ name: String, _ note: String?) -> String {
        guard let note = note?.trimmed, !note.isEmpty else { return name }
        return "\(name) · \(note)"
    }

    // MARK: Apply and undo

    func apply(_ templateID: String) async {
        await perform(templateID, reset: false)
    }

    /// The user confirmed that the month's data is deleted.
    func confirmReset() async {
        guard let request = pendingReset else { return }
        pendingReset = nil
        await perform(request.templateID, reset: true)
    }

    func cancelReset() {
        pendingReset = nil
    }

    /// The newest apply that still has unconfirmed copies; Undo is hidden without one.
    var undoableApply: TemplateApply? { applies.first { $0.unconfirmedCount > 0 } }

    func undo() async {
        guard let apply = undoableApply, !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do throws(APIError) {
            let removed = try await api.undoTemplateApply(id: apply.id)
            applies = try await api.templateApplies(month: month.month)
            statusMessage = String(localized: "month.undone \(removed.removedExpenseCount + removed.removedIncomeEntryCount)")
            errorMessage = nil
            await onChange()
        } catch {
            errorMessage = error.message
        }
    }

    func dismissMessages() {
        errorMessage = nil
        statusMessage = nil
    }

    // MARK: Private

    private func loadPreview() async throws(APIError) {
        guard !selectedTemplateID.isEmpty else {
            preview = nil
            return
        }
        let id = selectedTemplateID
        let found = try await api.template(id: id)
        guard id == selectedTemplateID else { return }
        preview = found
    }

    private func perform(_ templateID: String, reset: Bool) async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        let target = month.month
        do throws(APIError) {
            let result = try await api.applyTemplate(month: target, templateID: templateID, resetMonth: reset)
            applies = try await api.templateApplies(month: target)
            let removed = result.removedExpenseCount + result.removedIncomeEntryCount
            statusMessage = removed == 0
                ? String(localized: "month.applied \(result.apply.createdCount) \(CalendarDate.monthTitle(target))")
                : String(localized: "month.appliedReset \(result.apply.createdCount) \(removed)")
            errorMessage = nil
            startedBlank = false
            await onChange()
        } catch {
            if error.code == "month_not_empty" && !reset {
                await askToReset(templateID)
            } else {
                errorMessage = error.message
            }
        }
    }

    private func askToReset(_ templateID: String) async {
        let title = CalendarDate.monthTitle(month.month)
        do throws(APIError) {
            let counts = try await counts()
            pendingReset = ResetRequest(
                templateID: templateID,
                title: String(localized: "month.reset.title \(title)"),
                message: String(localized: "month.reset.message \(counts.expenses) \(counts.income) \(title)"))
            errorMessage = nil
        } catch {
            errorMessage = error.message
        }
    }
}

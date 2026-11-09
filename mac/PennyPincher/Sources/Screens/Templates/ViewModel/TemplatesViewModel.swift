import Foundation
import Observation

/// Templates (web/AGENTS.md "Templates"): the list, an editor for the chosen
/// template (income items, then expense items grouped by category), rename,
/// delete, and Apply to a chosen month.
@MainActor
@Observable
final class TemplatesViewModel {
    private(set) var phase: LoadPhase = .loading
    private(set) var templates: [TemplateSummary] = []
    private(set) var selected: Template?
    private(set) var categories: [ExpenseCategory] = []
    private(set) var sources: [IncomeSource] = []

    /// The list's selection; the view calls `selectionChanged()` when it changes.
    var selection: String?
    var newName = ""
    private(set) var newNameError: String?
    var renameText = ""
    var isRenaming = false
    private(set) var renameError: String?
    var pendingDelete: TemplateDelete?
    var expenseEditor: TemplateExpenseItemEditorViewModel?
    var incomeEditor: TemplateIncomeItemEditorViewModel?
    var showsApplySheet = false
    /// Apply to a chosen month (it starts at the month the other screens show).
    let applier: MonthTemplatesViewModel
    let applyMonth: MonthSelection

    private(set) var errorMessage: String?
    private(set) var statusMessage: String?
    private(set) var isWorking = false

    @ObservationIgnored private let api: LedgerAPI

    init(api: LedgerAPI, month: String) {
        self.api = api
        applyMonth = MonthSelection(month: month)
        applier = MonthTemplatesViewModel(api: api, month: applyMonth)
        applier.counts = { [api, applyMonth] () async throws(APIError) -> MonthCounts in
            let expenses = try await api.expenses(ExpenseQuery(month: applyMonth.month)).count
            let income = try await api.incomeEntries(month: applyMonth.month).count
            return MonthCounts(expenses: expenses, income: income)
        }
    }

    // MARK: Loading

    func load() async {
        if templates.isEmpty { phase = .loading }
        do throws(APIError) {
            categories = try await api.categories()
            sources = try await api.incomeSources()
            try await reloadTemplates()
            phase = .loaded
        } catch {
            phase = .failed(error.message)
        }
    }

    func selectionChanged() async {
        guard let id = selection, id != selected?.id else { return }
        do throws(APIError) {
            selected = try await api.template(id: id)
            errorMessage = nil
        } catch {
            errorMessage = error.message
        }
    }

    var canEdit: Bool { phase == .loaded }

    /// The list, with each template's item count.
    var listRows: [TemplateSummary] { templates }

    var isEmptyList: Bool { templates.isEmpty }

    var title: String { selected?.name ?? "" }

    var itemCountText: String? {
        selected.map { String(localized: "templates.itemCount \($0.expenseItems.count) \($0.incomeItems.count)") }
    }

    // MARK: Editor rows

    var totals: TemplateTotals? {
        selected.map { TemplateTotals($0, categories: categories) }
    }

    var incomeRows: [TemplateIncomeRow] {
        (selected?.incomeItems ?? []).sorted { $0.sortOrder < $1.sortOrder }.map { item in
            TemplateIncomeRow(
                id: item.id,
                dayText: String(item.dayOfMonth),
                source: sources.first { $0.id == item.incomeSourceID }?.name ?? "",
                label: item.note ?? "",
                grossText: Money.format(item.grossCents),
                taxableText: Money.format(item.grossTaxableCents),
                netText: Money.format(item.netCents),
                taxRateText: TaxRate.format(grossTaxableCents: item.grossTaxableCents, netCents: item.netCents))
        }
    }

    /// "All sources": the incomes' totals and their tax rate.
    var incomeTotal: TemplateIncomeRow? {
        guard let items = selected?.incomeItems, !items.isEmpty else { return nil }
        let gross = items.reduce(0) { $0 + $1.grossCents }
        let taxable = items.reduce(0) { $0 + $1.grossTaxableCents }
        let net = items.reduce(0) { $0 + $1.netCents }
        return TemplateIncomeRow(id: "total", dayText: "", source: String(localized: "templates.income.allSources"),
                                 label: "", grossText: Money.format(gross), taxableText: Money.format(taxable),
                                 netText: Money.format(net),
                                 taxRateText: TaxRate.format(grossTaxableCents: taxable, netCents: net))
    }

    var categoryGroups: [TemplateCategoryGroup] {
        let items = selected?.expenseItems ?? []
        return categories.map { category in
            let mine = items.filter { $0.categoryID == category.id }.sorted { $0.sortOrder < $1.sortOrder }
            return TemplateCategoryGroup(
                id: category.id, name: category.name, isSaving: category.isSaving,
                rows: mine.map { item in
                    let note = item.note?.trimmed ?? ""
                    return TemplateExpenseRow(id: item.id, dayText: String(item.dayOfMonth),
                                              title: note.isEmpty ? item.merchant.name : "\(item.merchant.name) · \(note)",
                                              amountText: Money.format(item.amountCents))
                },
                totalText: Money.format(mine.reduce(0) { $0 + $1.amountCents }))
        }
    }

    // MARK: Templates

    /// Creates an empty template from `newName` and selects it.
    func createTemplate() async {
        let name = newName.trimmed
        guard canEdit, !isWorking else { return }
        guard !name.isEmpty else {
            newNameError = String(localized: "templates.error.name")
            return
        }
        guard name.count <= FieldLimits.name else {
            newNameError = String(localized: "templates.error.nameTooLong \(FieldLimits.name)")
            return
        }
        await work { () async throws(APIError) in
            let created = try await api.createTemplate(name: name)
            newName = ""
            newNameError = nil
            selection = created.id
            selected = created
            try await reloadTemplates()
        } onFailure: { [self] error in
            newNameError = error.code == "name_taken" ? String(localized: "templates.error.nameTaken") : error.message
        }
    }

    func beginRename() {
        guard let selected, canEdit else { return }
        renameText = selected.name
        renameError = nil
        isRenaming = true
    }

    func commitRename() async {
        guard let selected else { return }
        let name = renameText.trimmed
        guard !name.isEmpty, name.count <= FieldLimits.name else {
            renameError = String(localized: "templates.error.name")
            isRenaming = true
            return
        }
        guard name != selected.name else { return }
        await work { () async throws(APIError) in
            self.selected = try await api.renameTemplate(id: selected.id, name: name)
            try await reloadTemplates()
            statusMessage = String(localized: "templates.renamed")
        } onFailure: { [self] error in
            errorMessage = error.code == "name_taken" ? String(localized: "templates.error.nameTaken") : error.message
        }
    }

    func requestDeleteTemplate() {
        guard let selected, canEdit else { return }
        pendingDelete = TemplateDelete(
            target: .template(id: selected.id),
            title: String(localized: "templates.delete.title \(selected.name)"),
            message: String(localized: "templates.delete.message"),
            confirmTitle: String(localized: "templates.delete.confirm"))
    }

    func confirmDelete() async {
        guard let request = pendingDelete else { return }
        pendingDelete = nil
        switch request.target {
        case .template(let id):
            await work { () async throws(APIError) in
                try await api.deleteTemplate(id: id)
                selected = nil
                selection = nil
                try await reloadTemplates()
                statusMessage = String(localized: "templates.deleted")
            }
        case .expenseItem(let id):
            await removeExpenseItem(id)
        case .incomeItem(let id):
            await removeIncomeItem(id)
        }
    }

    // MARK: Items

    func addExpenseItem(in categoryID: String? = nil) {
        guard let selected, canEdit else { return }
        let fallback = categories.first { !$0.isProtected && !$0.isSaving }?.id ?? categories.first?.id ?? ""
        expenseEditor = TemplateExpenseItemEditorViewModel(
            item: nil, categories: categories, categoryID: categoryID ?? fallback, day: 1
        ) { [weak self] draft throws(APIError) in
            guard let self else { return }
            _ = try await api.createExpenseItem(templateID: selected.id, draft)
            try await refreshSelected()
        }
    }

    func editExpenseItem(_ id: String) {
        guard let selected, canEdit, let item = selected.expenseItems.first(where: { $0.id == id }) else { return }
        expenseEditor = TemplateExpenseItemEditorViewModel(item: item, categories: categories) { [weak self] draft throws(APIError) in
            guard let self else { return }
            _ = try await api.updateExpenseItem(templateID: selected.id, itemID: id, draft)
            try await refreshSelected()
        }
    }

    func requestRemoveExpenseItem(_ id: String) {
        guard canEdit, let item = selected?.expenseItems.first(where: { $0.id == id }) else { return }
        pendingDelete = TemplateDelete(
            target: .expenseItem(id: id),
            title: String(localized: "templates.removeItem.title \(item.merchant.name)"),
            message: String(localized: "templates.removeItem.message"),
            confirmTitle: String(localized: "templates.removeItem.confirm"))
    }

    func addIncomeItem() {
        guard let selected, canEdit else { return }
        let fallback = sources.first { !$0.isProtected }?.id ?? sources.first?.id ?? ""
        incomeEditor = TemplateIncomeItemEditorViewModel(item: nil, sources: sources, sourceID: fallback, day: 1) {
            [weak self] draft throws(APIError) in
            guard let self else { return }
            _ = try await api.createIncomeItem(templateID: selected.id, draft)
            try await refreshSelected()
        }
    }

    func editIncomeItem(_ id: String) {
        guard let selected, canEdit, let item = selected.incomeItems.first(where: { $0.id == id }) else { return }
        incomeEditor = TemplateIncomeItemEditorViewModel(item: item, sources: sources) { [weak self] draft throws(APIError) in
            guard let self else { return }
            _ = try await api.updateIncomeItem(templateID: selected.id, itemID: id, draft)
            try await refreshSelected()
        }
    }

    func requestRemoveIncomeItem(_ id: String) {
        guard canEdit, let item = selected?.incomeItems.first(where: { $0.id == id }) else { return }
        let source = sources.first { $0.id == item.incomeSourceID }?.name ?? ""
        pendingDelete = TemplateDelete(
            target: .incomeItem(id: id),
            title: String(localized: "templates.removeItem.title \(source)"),
            message: String(localized: "templates.removeItem.message"),
            confirmTitle: String(localized: "templates.removeItem.confirm"))
    }

    private func removeExpenseItem(_ id: String) async {
        guard let selected else { return }
        await work { () async throws(APIError) in
            try await api.deleteExpenseItem(templateID: selected.id, itemID: id)
            try await refreshSelected()
        }
    }

    private func removeIncomeItem(_ id: String) async {
        guard let selected else { return }
        await work { () async throws(APIError) in
            try await api.deleteIncomeItem(templateID: selected.id, itemID: id)
            try await refreshSelected()
        }
    }

    // MARK: Apply

    /// Opens the Apply sheet for the chosen template.
    func beginApply() {
        guard selected != nil, canEdit else { return }
        applier.dismissMessages()
        showsApplySheet = true
    }

    var applyTitle: String { String(localized: "templates.apply.title \(applyMonth.title)") }

    var canApply: Bool { (selected?.expenseItems.count ?? 0) + (selected?.incomeItems.count ?? 0) > 0 }

    /// Copies the template into the chosen month. A month with data asks to
    /// reset first; the sheet closes once the copy has landed.
    func apply() async {
        guard let id = selected?.id else { return }
        await applier.apply(id)
        closeApplySheetIfDone()
    }

    func confirmApplyReset() async {
        await applier.confirmReset()
        closeApplySheetIfDone()
    }

    func dismissMessages() {
        errorMessage = nil
        statusMessage = nil
        applier.dismissMessages()
    }

    var noticeMessage: String? { errorMessage ?? statusMessage ?? applier.statusMessage }
    var noticeIsError: Bool { errorMessage != nil }

    // MARK: Private

    private func closeApplySheetIfDone() {
        if applier.pendingReset == nil && applier.errorMessage == nil { showsApplySheet = false }
    }

    private func reloadTemplates() async throws(APIError) {
        templates = try await api.templates()
        let ids = Set(templates.map(\.id))
        if let current = selection, !ids.contains(current) { selection = nil }
        if selection == nil { selection = templates.first?.id }
        if selected == nil || selected?.id != selection {
            if let id = selection {
                selected = try await api.template(id: id)
            } else {
                selected = nil
            }
        }
    }

    /// After an item change: the template and the list's counts.
    private func refreshSelected() async throws(APIError) {
        guard let id = selected?.id else { return }
        selected = try await api.template(id: id)
        templates = try await api.templates()
    }

    private func work(
        _ action: () async throws(APIError) -> Void,
        onFailure: ((APIError) -> Void)? = nil
    ) async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do throws(APIError) {
            try await action()
            errorMessage = nil
        } catch {
            if let onFailure { onFailure(error) } else { errorMessage = error.message }
            statusMessage = nil
        }
    }
}

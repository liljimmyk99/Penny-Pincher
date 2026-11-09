import Foundation
import Observation

/// Categories & sources (web/AGENTS.md): reorder by drag or from the keyboard,
/// rename inline, add, and delete with a confirmation. "Other" is locked in
/// both lists; a source with entries can only be renamed.
@MainActor
@Observable
final class CategoriesViewModel {
    private(set) var phase: LoadPhase = .loading
    private(set) var categories: [ExpenseCategory] = []
    private(set) var sources: [IncomeSource] = []
    private var categoryStats: [String: CategoryStats] = [:]
    private var sourceStats: [String: IncomeSourceStats] = [:]

    /// The row being renamed, and what is typed.
    private(set) var renaming: ManagedItemID?
    var renameText = ""
    private(set) var renameError: String?

    var newCategoryName = ""
    var newSourceName = ""
    private(set) var addCategoryError: String?
    private(set) var addSourceError: String?

    /// Drives the delete confirmation dialog.
    var pendingDelete: DeleteRequest?
    /// A failed reorder or delete.
    private(set) var errorMessage: String?
    /// A brief confirmation, such as what a delete moved to Other.
    private(set) var statusMessage: String?
    private(set) var isSaving = false

    let year: Int
    @ObservationIgnored private let api: CategoriesAPI

    init(api: CategoriesAPI, today: String = CalendarDate.today()) {
        self.api = api
        year = CalendarDate.year(of: today)
    }

    // MARK: Loading

    func load() async {
        if categories.isEmpty { phase = .loading }
        do throws(APIError) {
            let categories = try await api.categories()
            let categoryStats = try await api.categoryStats(year: year)
            let sources = try await api.incomeSources()
            let sourceStats = try await api.incomeSourceStats(year: year)
            self.categories = categories
            self.sources = sources
            self.categoryStats = Dictionary(categoryStats.map { ($0.categoryID, $0) }, uniquingKeysWith: { a, _ in a })
            self.sourceStats = Dictionary(sourceStats.map { ($0.incomeSourceID, $0) }, uniquingKeysWith: { a, _ in a })
            phase = .loaded
        } catch {
            phase = .failed(error.message)
        }
    }

    // MARK: Display

    var eyebrow: String { String(localized: "categories.eyebrow \(String(year))") }

    var categoryRows: [ManagedRow] {
        let movable = categories.filter { !$0.isProtected }
        return categories.map { category in
            let stats = categoryStats[category.id]
            let index = movable.firstIndex(of: category)
            return ManagedRow(
                id: category.id,
                name: category.name,
                columns: [String(stats?.entryCount ?? 0), Money.format(stats?.yearTotalCents ?? 0)],
                badges: [RowBadge.saving].filter { _ in category.isSaving } + [RowBadge.locked].filter { _ in category.isProtected },
                isLocked: category.isProtected,
                canDelete: !category.isProtected,
                deleteHelp: nil,
                canMoveUp: index.map { $0 > 0 } ?? false,
                canMoveDown: index.map { $0 < movable.count - 1 } ?? false
            )
        }
    }

    var sourceRows: [ManagedRow] {
        let movable = sources.filter { !$0.isProtected }
        return sources.map { source in
            let stats = sourceStats[source.id]
            let index = movable.firstIndex(of: source)
            let entries = stats?.entryCount ?? 0
            let canDelete = !source.isProtected && !source.hasEntries && entries == 0
            return ManagedRow(
                id: source.id,
                name: source.name,
                columns: [
                    String(entries),
                    Money.format(stats?.yearGrossCents ?? 0),
                    Money.format(stats?.yearNetCents ?? 0),
                    TaxRate.format(grossTaxableCents: stats?.yearGrossTaxableCents ?? 0, netCents: stats?.yearNetCents ?? 0),
                ],
                badges: source.isProtected ? [.locked] : [],
                isLocked: source.isProtected,
                canDelete: canDelete,
                deleteHelp: canDelete || source.isProtected ? nil : "sources.delete.hasEntries",
                canMoveUp: index.map { $0 > 0 } ?? false,
                canMoveDown: index.map { $0 < movable.count - 1 } ?? false
            )
        }
    }

    func isRenaming(_ kind: ManagedKind, _ id: String) -> Bool {
        renaming == ManagedItemID(kind: kind, id: id)
    }

    // MARK: Rename

    func beginRename(_ kind: ManagedKind, _ id: String) {
        guard let name = name(kind, id), !isLocked(kind, id) else { return }
        renaming = ManagedItemID(kind: kind, id: id)
        renameText = name
        renameError = nil
    }

    func cancelRename() {
        renaming = nil
        renameError = nil
    }

    func commitRename() async {
        guard let target = renaming, !isSaving else { return }
        let name = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
        if let problem = nameProblem(name) {
            renameError = problem
            return
        }
        guard name != self.name(target.kind, target.id) else {
            cancelRename()
            return
        }
        isSaving = true
        defer { isSaving = false }
        do throws(APIError) {
            switch target.kind {
            case .category:
                let updated = try await api.renameCategory(id: target.id, name: name)
                if let index = categories.firstIndex(where: { $0.id == target.id }) { categories[index] = updated }
            case .source:
                let updated = try await api.renameIncomeSource(id: target.id, name: name)
                if let index = sources.firstIndex(where: { $0.id == target.id }) { sources[index] = updated }
            }
            renaming = nil
            renameError = nil
        } catch {
            renameError = error.message
        }
    }

    // MARK: Add

    func addCategory() async {
        let name = newCategoryName.trimmingCharacters(in: .whitespacesAndNewlines)
        if let problem = nameProblem(name) {
            addCategoryError = problem
            return
        }
        isSaving = true
        defer { isSaving = false }
        do throws(APIError) {
            _ = try await api.createCategory(name: name)
            newCategoryName = ""
            addCategoryError = nil
            await load()
        } catch {
            addCategoryError = error.message
        }
    }

    func addSource() async {
        let name = newSourceName.trimmingCharacters(in: .whitespacesAndNewlines)
        if let problem = nameProblem(name) {
            addSourceError = problem
            return
        }
        isSaving = true
        defer { isSaving = false }
        do throws(APIError) {
            _ = try await api.createIncomeSource(name: name)
            newSourceName = ""
            addSourceError = nil
            await load()
        } catch {
            addSourceError = error.message
        }
    }

    // MARK: Delete

    /// Opens the confirmation. "Other" and sources with entries can't be deleted.
    func requestDelete(_ kind: ManagedKind, _ id: String) {
        switch kind {
        case .category:
            guard let category = categories.first(where: { $0.id == id }), !category.isProtected else { return }
            let stats = categoryStats[id]
            let count = stats?.entryCount ?? 0
            let amount = Money.format(stats?.totalCents ?? 0)
            let moves: String = switch count {
            case 0: String(localized: "categories.delete.moves.none")
            case 1: String(localized: "categories.delete.moves.one \(amount)")
            default: String(localized: "categories.delete.moves.many \(count) \(amount)")
            }
            pendingDelete = DeleteRequest(
                item: ManagedItemID(kind: .category, id: id),
                title: String(localized: "categories.delete.title \(category.name)"),
                message: moves + " " + String(localized: "categories.delete.templates"),
                confirmTitle: String(localized: "categories.delete.confirm")
            )
        case .source:
            guard let row = sourceRows.first(where: { $0.id == id }), row.canDelete else { return }
            pendingDelete = DeleteRequest(
                item: ManagedItemID(kind: .source, id: id),
                title: String(localized: "sources.delete.title \(row.name)"),
                message: String(localized: "sources.delete.message"),
                confirmTitle: String(localized: "sources.delete.confirm")
            )
        }
    }

    func confirmDelete() async {
        guard let request = pendingDelete else { return }
        pendingDelete = nil
        isSaving = true
        defer { isSaving = false }
        do throws(APIError) {
            switch request.item.kind {
            case .category:
                let count = categoryStats[request.item.id]?.entryCount ?? 0
                try await api.deleteCategory(id: request.item.id)
                statusMessage = count == 0 ? String(localized: "categories.deleted")
                    : String(localized: "categories.deleted.moved \(count)")
            case .source:
                try await api.deleteIncomeSource(id: request.item.id)
                statusMessage = String(localized: "sources.deleted")
            }
            errorMessage = nil
            await load()
        } catch {
            errorMessage = error.message
        }
    }

    // MARK: Reorder

    /// A drag in the list (`onMove`). "Other" keeps its place.
    func move(_ kind: ManagedKind, from source: IndexSet, to destination: Int) async {
        guard let order = Reorder.applying(items(kind), from: source, to: destination) else { return }
        await save(kind, order: order)
    }

    /// Move Up / Move Down, for the keyboard and VoiceOver.
    func move(_ kind: ManagedKind, _ id: String, by offset: Int) async {
        let movable = items(kind).filter { !$0.locked }
        guard let index = movable.firstIndex(where: { $0.id == id }),
              let order = Reorder.move(items(kind), id: id, toUnlockedIndex: index + offset) else { return }
        await save(kind, order: order)
    }

    func dismissMessages() {
        errorMessage = nil
        statusMessage = nil
    }

    // MARK: Private

    private func items(_ kind: ManagedKind) -> [Reorder.Item] {
        switch kind {
        case .category: categories.map { Reorder.Item(id: $0.id, locked: $0.isProtected) }
        case .source: sources.map { Reorder.Item(id: $0.id, locked: $0.isProtected) }
        }
    }

    /// Shows the new order at once, then saves it; a failure puts the old one back.
    private func save(_ kind: ManagedKind, order: [String]) async {
        switch kind {
        case .category:
            let previous = categories
            categories = order.compactMap { id in previous.first { $0.id == id } }
            do throws(APIError) {
                categories = try await api.reorderCategories(ids: order)
                errorMessage = nil
            } catch {
                categories = previous
                errorMessage = error.message
            }
        case .source:
            let previous = sources
            sources = order.compactMap { id in previous.first { $0.id == id } }
            do throws(APIError) {
                sources = try await api.reorderIncomeSources(ids: order)
                errorMessage = nil
            } catch {
                sources = previous
                errorMessage = error.message
            }
        }
    }

    private func name(_ kind: ManagedKind, _ id: String) -> String? {
        switch kind {
        case .category: categories.first { $0.id == id }?.name
        case .source: sources.first { $0.id == id }?.name
        }
    }

    private func isLocked(_ kind: ManagedKind, _ id: String) -> Bool {
        switch kind {
        case .category: categories.first { $0.id == id }?.isProtected ?? true
        case .source: sources.first { $0.id == id }?.isProtected ?? true
        }
    }

    private func nameProblem(_ name: String) -> String? {
        if name.isEmpty { return String(localized: "categories.error.nameRequired") }
        if name.count > FieldLimits.name { return String(localized: "categories.error.nameTooLong \(FieldLimits.name)") }
        return nil
    }
}

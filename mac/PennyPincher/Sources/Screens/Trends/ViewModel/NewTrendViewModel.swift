import Foundation
import Observation

/// The New Trend sheet: a name, what to match (a merchant, a category or note
/// text) and the measure. The merchant must be one the person has used.
@MainActor
@Observable
final class NewTrendViewModel: Identifiable {
    static let maxSuggestions = 8

    let id = UUID()
    let categories: [ExpenseCategory]
    let merchants: [Merchant]
    var name = ""
    var matchType: SavedTrend.MatchType = .merchant {
        didSet { errors[.value] = nil }
    }
    var merchant = ""
    var categoryID = ""
    var text = ""
    var measure: TrendMeasure = .amount
    private(set) var errors: [NewTrendField: String] = [:]
    private(set) var errorMessage: String?
    private(set) var isSaving = false

    @ObservationIgnored private let api: TrendsAPI
    @ObservationIgnored private let onCreated: @MainActor (SavedTrend) async -> Void

    init(categories: [ExpenseCategory], merchants: [Merchant], api: TrendsAPI,
         onCreated: @escaping @MainActor (SavedTrend) async -> Void) {
        self.categories = categories
        self.merchants = merchants
        self.api = api
        self.onCreated = onCreated
    }

    var valueTitle: LocalizedStringResource {
        switch matchType {
        case .merchant: "trends.new.merchant"
        case .category: "trends.new.category"
        case .note: "trends.new.note"
        }
    }

    /// Past merchants starting with what's typed, for autocomplete.
    var merchantSuggestions: [Merchant] {
        let typed = merchant.trimmed.lowercased()
        let found = typed.isEmpty ? merchants : merchants.filter { $0.name.lowercased().hasPrefix(typed) }
        return Array(found.prefix(Self.maxSuggestions))
    }

    func error(_ field: NewTrendField) -> String? { errors[field] }

    /// The trend to create, or nil with `errors` set.
    func draft() -> SavedTrendDraft? {
        var found: [NewTrendField: String] = [:]
        let trimmedName = name.trimmed
        if trimmedName.isEmpty { found[.name] = String(localized: "trends.new.error.name") }
        var draft = SavedTrendDraft(name: trimmedName, matchType: matchType, measure: measure)
        switch matchType {
        case .merchant:
            let typed = merchant.trimmed
            if let match = merchants.first(where: { $0.name.lowercased() == typed.lowercased() }) {
                draft.merchantID = match.id
            } else {
                found[.value] = typed.isEmpty ? String(localized: "trends.new.error.chooseMerchant")
                    : String(localized: "trends.new.error.unknownMerchant")
            }
        case .category:
            if categories.contains(where: { $0.id == categoryID }) {
                draft.categoryID = categoryID
            } else {
                found[.value] = String(localized: "trends.new.error.chooseCategory")
            }
        case .note:
            let typed = text.trimmed
            if typed.isEmpty { found[.value] = String(localized: "trends.new.error.note") } else { draft.matchText = typed }
        }
        errors = found
        return found.isEmpty ? draft : nil
    }

    /// Saves and returns true when the sheet can close.
    func save() async -> Bool {
        guard !isSaving else { return false }
        errorMessage = nil
        guard let draft = draft() else { return false }
        isSaving = true
        defer { isSaving = false }
        do throws(APIError) {
            let created = try await api.createSavedTrend(draft)
            await onCreated(created)
            return true
        } catch {
            if let detail = error.details.first(where: { $0.field == "name" }) {
                errors[.name] = detail.issue
            } else {
                errorMessage = error.message
            }
            return false
        }
    }
}

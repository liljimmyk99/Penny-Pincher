import Foundation

extension SavedTrend.MatchType {
    /// The New Trend sheet's "Match by" choices.
    var title: LocalizedStringResource {
        switch self {
        case .merchant: "trends.matchBy.merchant"
        case .category: "trends.matchBy.category"
        case .note: "trends.matchBy.note"
        }
    }
}

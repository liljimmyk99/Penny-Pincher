import Foundation

/// The sidebar, in the order mac/AGENTS.md fixes.
enum SidebarItem: String, CaseIterable, Identifiable, Hashable {
    case summary
    case addEntries
    case transactions
    case yearly
    case trends
    case templates
    case categories
    case importData

    var id: String { rawValue }

    var title: LocalizedStringResource {
        switch self {
        case .summary: "sidebar.summary"
        case .addEntries: "sidebar.addEntries"
        case .transactions: "sidebar.transactions"
        case .yearly: "sidebar.yearly"
        case .trends: "sidebar.trends"
        case .templates: "sidebar.templates"
        case .categories: "sidebar.categories"
        case .importData: "sidebar.import"
        }
    }

    var symbol: String {
        switch self {
        case .summary: "square.grid.2x2"
        case .addEntries: "plus.circle"
        case .transactions: "list.bullet"
        case .yearly: "calendar"
        case .trends: "chart.bar"
        case .templates: "doc.on.doc"
        case .categories: "tag"
        case .importData: "square.and.arrow.down"
        }
    }
}

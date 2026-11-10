import Foundation

/// The two Trends views, switched by a segmented control.
enum TrendsMode: String, CaseIterable, Identifiable {
    case custom
    case byCategory

    var id: String { rawValue }

    var title: LocalizedStringResource {
        switch self {
        case .custom: "trends.mode.custom"
        case .byCategory: "trends.mode.byCategory"
        }
    }
}

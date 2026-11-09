import SwiftUI

/// A badge beside a name.
enum RowBadge: Equatable {
    /// Saving: counted as an expense but shown apart.
    case saving
    /// The protected "Other".
    case locked

    var title: LocalizedStringResource {
        switch self {
        case .saving: "categories.badge.saving"
        case .locked: "categories.badge.default"
        }
    }

    var tint: Color {
        switch self {
        case .saving: .saving
        case .locked: .secondary
        }
    }
}

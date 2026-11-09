import SwiftUI

extension ChangeTone {
    /// Orange for worse, blue for better, secondary for no change.
    var color: Color {
        switch self {
        case .worse: .brand
        case .better: .brandPrimary
        case .none: .secondary
        }
    }
}

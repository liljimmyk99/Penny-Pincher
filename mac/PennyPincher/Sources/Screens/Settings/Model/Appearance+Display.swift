import Foundation

/// How each appearance option reads in Settings.
extension Appearance {
    var title: LocalizedStringResource {
        switch self {
        case .light: "appearance.light"
        case .dark: "appearance.dark"
        case .system: "appearance.system"
        }
    }

    var symbol: String {
        switch self {
        case .light: "sun.max"
        case .dark: "moon"
        case .system: "circle.lefthalf.filled"
        }
    }
}

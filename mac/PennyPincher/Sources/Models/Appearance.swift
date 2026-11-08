import AppKit

/// Light, Dark or System, chosen in Settings (⌘,). A UI preference, so it
/// lives in UserDefaults (mac/AGENTS.md, Rules).
enum Appearance: String, CaseIterable, Identifiable, Sendable {
    case light, dark, system

    static let storageKey = "appearance"

    var id: String { rawValue }

    /// nil follows the system setting.
    var nsAppearance: NSAppearance? {
        switch self {
        case .light: NSAppearance(named: .aqua)
        case .dark: NSAppearance(named: .darkAqua)
        case .system: nil
        }
    }

    init(stored: String?) {
        self = stored.flatMap(Appearance.init(rawValue:)) ?? .system
    }
}

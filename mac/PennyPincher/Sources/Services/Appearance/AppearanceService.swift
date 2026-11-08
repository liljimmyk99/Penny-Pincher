import AppKit
import Observation

/// Owns the Light / Dark / System preference: stores it and applies it to
/// every window (the Settings window included).
@MainActor
@Observable
final class AppearanceService {
    @ObservationIgnored private let defaults: UserDefaults

    var appearance: Appearance {
        didSet {
            defaults.set(appearance.rawValue, forKey: Appearance.storageKey)
            apply()
        }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        appearance = Appearance(stored: defaults.string(forKey: Appearance.storageKey))
    }

    func apply() {
        NSApplication.shared.appearance = appearance.nsAppearance
    }
}

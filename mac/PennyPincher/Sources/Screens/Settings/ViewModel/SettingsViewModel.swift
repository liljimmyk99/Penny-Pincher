import Observation

/// The Settings window (⌘,).
@MainActor
@Observable
final class SettingsViewModel {
    @ObservationIgnored private let appearanceService: AppearanceService
    let appearanceOptions = Appearance.allCases

    init(appearance: AppearanceService) {
        appearanceService = appearance
    }

    /// Changing it stores and applies it at once.
    var appearance: Appearance {
        get { appearanceService.appearance }
        set { appearanceService.appearance = newValue }
    }
}

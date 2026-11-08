import AppKit
import Testing
@testable import PennyPincher

@MainActor
@Suite("Settings view model")
struct SettingsViewModelTests {
    @Test("Changing the appearance stores and applies it")
    func storesAndApplies() {
        defer { NSApplication.shared.appearance = nil }
        let defaults = makeTestDefaults()
        let viewModel = SettingsViewModel(appearance: AppearanceService(defaults: defaults))
        #expect(viewModel.appearance == .system)
        #expect(viewModel.appearanceOptions == [.light, .dark, .system])

        viewModel.appearance = .dark
        #expect(defaults.string(forKey: Appearance.storageKey) == "dark")
        #expect(NSApplication.shared.appearance?.name == .darkAqua)

        viewModel.appearance = .system
        #expect(NSApplication.shared.appearance == nil)
        #expect(AppearanceService(defaults: defaults).appearance == .system)
    }

    @Test("Option titles")
    func titles() {
        #expect(Appearance.allCases.map { String(localized: $0.title) } == ["Light", "Dark", "System"])
    }
}

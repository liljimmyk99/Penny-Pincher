import AppKit
import Testing
@testable import PennyPincher

@Suite("Appearance")
struct AppearanceTests {
    @Test("Defaults to System")
    func defaultsToSystem() {
        #expect(Appearance(stored: nil) == .system)
        #expect(Appearance(stored: "nonsense") == .system)
        #expect(Appearance(stored: "dark") == .dark)
    }

    @Test("Maps to AppKit appearances")
    func appKit() {
        #expect(Appearance.system.nsAppearance == nil)
        #expect(Appearance.light.nsAppearance?.name == .aqua)
        #expect(Appearance.dark.nsAppearance?.name == .darkAqua)
    }
}

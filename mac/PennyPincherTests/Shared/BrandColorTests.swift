import AppKit
import Testing
@testable import PennyPincher

/// The asset catalog matches the colour table in mac/AGENTS.md.
@Suite("Brand colours")
struct BrandColorTests {
    static let expected: [BrandColor: (light: String, dark: String)] = [
        .primary: ("#1F5FD6", "#2F6BE0"),
        .brand: ("#F97316", "#F97316"),
        .income: ("#15803D", "#5BD68A"),
        .saving: ("#1F5FD6", "#3D78EA"),
        .spent: ("#475569", "#8C9AB0"),
        .refund: ("#166534", "#6EE7A0"),
        .refundBackground: ("#F0FDF4", "#0F2A1C"),
        .unconfirmed: ("#9A3412", "#FDBA74"),
        .unconfirmedBackground: ("#FFF7ED", "#2B1D12"),
    ]

    @Test("The table covers every colour")
    func coversEveryColour() {
        #expect(Set(Self.expected.keys) == Set(BrandColor.allCases))
    }

    @Test("Each colour has its light and dark value", arguments: BrandColor.allCases)
    func lightAndDark(color: BrandColor) throws {
        let named = try #require(NSColor(named: color.rawValue, bundle: Bundle(for: AppContainer.self)))
        #expect(hex(named, in: .aqua) == Self.expected[color]?.light)
        #expect(hex(named, in: .darkAqua) == Self.expected[color]?.dark)
    }

    private func hex(_ color: NSColor, in appearance: NSAppearance.Name) -> String? {
        var result: String?
        NSAppearance(named: appearance)?.performAsCurrentDrawingAppearance {
            guard let rgb = color.usingColorSpace(.sRGB) else { return }
            let channels = [rgb.redComponent, rgb.greenComponent, rgb.blueComponent]
            result = "#" + channels.map { String(format: "%02X", Int(($0 * 255).rounded())) }.joined()
        }
        return result
    }
}

import SwiftUI

/// Chart colours for categories that have none of their own (matches the web
/// `--chart-1…8` tokens). Saving always keeps its own colour.
enum ChartPalette {
    private static let light: [String] = ["#0F766E", "#B45309", "#7C3AED", "#BE123C", "#4D7C0F", "#0369A1", "#A21CAF", "#64748B"]

    /// A category's bar or slice colour: Saving is `Color.saving`, else its own
    /// `#RRGGBB`, else the palette slot for its position.
    static func color(isSaving: Bool, hex: String?, index: Int) -> Color {
        if isSaving { return .saving }
        if let hex, let color = Color(hex: hex) { return color }
        return Color(hex: light[index % light.count]) ?? .spent
    }
}

extension Color {
    /// `#RRGGBB` (the leading # is optional); nil for anything else.
    init?(hex: String) {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6, let value = Int(digits, radix: 16) else { return nil }
        self.init(red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255,
                  blue: Double(value & 0xFF) / 255)
    }
}

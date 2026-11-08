import SwiftUI

/// The brand colours from the asset catalog (mac/AGENTS.md, Look and feel),
/// each with light and dark variants. Everything else uses system colours.
extension Color {
    static let brandPrimary = Color(BrandColor.primary.rawValue)
    static let brand = Color(BrandColor.brand.rawValue)
    static let income = Color(BrandColor.income.rawValue)
    static let saving = Color(BrandColor.saving.rawValue)
    static let spent = Color(BrandColor.spent.rawValue)
    static let refund = Color(BrandColor.refund.rawValue)
    static let refundBackground = Color(BrandColor.refundBackground.rawValue)
    static let unconfirmed = Color(BrandColor.unconfirmed.rawValue)
    static let unconfirmedBackground = Color(BrandColor.unconfirmedBackground.rawValue)
}

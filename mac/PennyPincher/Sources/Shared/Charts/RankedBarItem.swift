import SwiftUI

/// One row of a ranked chart (bars or donut): a category's amount, with its
/// share and change when the screen has them.
struct RankedBarItem: Identifiable, Equatable {
    var id: String
    var name: String
    var valueCents: Int
    var color: Color
    var isSaving: Bool
    var amountText: String
    /// "34% of income", or nil.
    var detailText: String?
    var change: Change?
    var accessibilityLabel: String
}

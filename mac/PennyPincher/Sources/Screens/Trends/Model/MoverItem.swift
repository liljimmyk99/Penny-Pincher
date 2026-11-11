import SwiftUI

/// A row of Biggest movers: a diverging bar right of zero for an increase,
/// left for a decrease, coloured by meaning.
struct MoverItem: Identifiable, Equatable {
    /// The category's id.
    var id: String
    var name: String
    var deltaCents: Int
    var tone: ChangeTone
    var isSaving: Bool
    /// "▲ +$12.00".
    var changeText: String
    var accessibilityLabel: String
}

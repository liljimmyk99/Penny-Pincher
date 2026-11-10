import SwiftUI

/// A figure on Trends, with an optional change or caption under it.
struct TrendTile: Identifiable, Equatable {
    var id: String
    var title: String
    var valueText: String
    var tint: Color = .primary
    var caption: String?
    var change: ChangeText?
}

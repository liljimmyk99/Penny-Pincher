import SwiftUI

/// One of the four figures at the top of Summary.
struct SummaryTile: Identifiable, Equatable {
    var id: String
    var title: LocalizedStringResource
    var valueText: String
    /// Muted tiles (an empty month) show $0.00 in secondary text.
    var tint: Color
    var detail: LocalizedStringResource?
    var change: Change?
}

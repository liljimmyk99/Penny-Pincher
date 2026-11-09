import SwiftUI

/// A labelled figure for `FigureTile`.
struct FigureTileItem: Identifiable, Equatable {
    var id: String
    var title: LocalizedStringKey
    var value: String
    var tint: Color
    var detail: String?
}

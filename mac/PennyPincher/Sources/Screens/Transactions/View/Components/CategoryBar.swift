import SwiftUI

/// A thin bar for a category's share; Saving keeps its own colour.
struct CategoryBar: View {
    let fraction: Double
    let isSaving: Bool

    var body: some View {
        Capsule()
            .fill(Color.secondary.opacity(0.15))
            .frame(height: 4)
            .overlay(alignment: .leading) {
                GeometryReader { proxy in
                    Capsule()
                        .fill(isSaving ? Color.saving : Color.spent)
                        .frame(width: proxy.size.width * max(0, min(1, fraction)))
                }
            }
            .accessibilityHidden(true)
    }
}

import SwiftUI

/// A centered brand mark with a short status underneath.
struct StatusView<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 14) {
            BrandMark()
            content
        }
        .padding(32)
        .frame(maxWidth: 460)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

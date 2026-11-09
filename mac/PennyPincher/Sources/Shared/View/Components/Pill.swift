import SwiftUI

/// A small rounded label, such as a badge or a refund tag.
struct Pill: View {
    let text: Text
    let foreground: Color
    let background: Color

    var body: some View {
        text
            .font(.caption.weight(.medium))
            .foregroundStyle(foreground)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(background, in: .capsule)
    }
}

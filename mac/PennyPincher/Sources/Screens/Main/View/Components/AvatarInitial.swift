import SwiftUI

/// A round initial. Decorative: the name is always shown next to it.
struct AvatarInitial: View {
    let initial: String

    var body: some View {
        Text(initial)
            .font(.callout.weight(.semibold))
            .foregroundStyle(.white)
            .frame(width: 30, height: 30)
            .background(Color.brandPrimary, in: .circle)
            .accessibilityHidden(true)
    }
}

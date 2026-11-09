import SwiftUI

struct RowBadgeView: View {
    let badge: RowBadge

    var body: some View {
        Pill(text: Text(badge.title), foreground: badge.tint, background: badge.tint.opacity(0.12))
    }
}

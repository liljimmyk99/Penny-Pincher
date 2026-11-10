import SwiftUI

/// The selected trend's definition: what it matches and since when.
struct TrendPills: View {
    let pills: [String]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(pills, id: \.self) { pill in
                Pill(text: Text(pill), foreground: .secondary, background: Color.secondary.opacity(0.12))
            }
        }
        .accessibilityElement(children: .combine)
    }
}

import SwiftUI

/// "▲ +$12.00 (+10%) vs. last month": the change in its colour (orange worse,
/// blue better), then what it compares with. The arrow and sign mean colour is
/// never the only cue.
struct TrendChangeLabel: View {
    let change: ChangeText

    var body: some View {
        HStack(spacing: 4) {
            Text(change.text)
                .monospacedDigit()
                .foregroundStyle(change.tone.color)
            Text(change.suffix)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(change.words)
    }
}

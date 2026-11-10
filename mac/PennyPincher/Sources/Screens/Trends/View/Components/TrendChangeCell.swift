import SwiftUI

/// A change in the table, or "—" for a month that hasn't happened yet.
struct TrendChangeCell: View {
    let change: ChangeText?

    var body: some View {
        if let change {
            Text(change.text)
                .monospacedDigit()
                .foregroundStyle(change.tone.color)
                .accessibilityLabel(change.words)
        } else {
            Text(verbatim: "—")
                .foregroundStyle(.secondary)
                .accessibilityLabel(Text("trends.table.none"))
        }
    }
}

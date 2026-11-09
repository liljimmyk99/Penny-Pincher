import SwiftUI

/// A change indicator: coloured by meaning (orange worse, blue better), with an
/// arrow and a +/− sign so colour is never the only cue.
struct ChangeLabel: View {
    let change: Change

    var body: some View {
        Text(change.text)
            .monospacedDigit()
            .foregroundStyle(change.tone.color)
            .accessibilityLabel(change.words)
    }
}

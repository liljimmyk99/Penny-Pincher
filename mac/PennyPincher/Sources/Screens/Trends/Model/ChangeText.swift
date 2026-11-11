import Foundation

/// A change ready to show: "▲ +$12.00 (+10%)" coloured by meaning (orange
/// worse, blue better, flipped for Saving), the words after it ("vs. last
/// month") and the whole thing in words for accessibility.
struct ChangeText: Equatable {
    var tone: ChangeTone
    /// "▲ +$12.00 (+10%)", or "No change".
    var text: String
    var suffix: String
    /// "Worse: +$12.00 (+10%) vs. last month".
    var words: String

    /// A change in cents, with its percent (By category).
    init(change: Change, suffix: String) {
        let amount = [change.amountText, change.percentText.map { "(\($0))" }].compactMap { $0 }.joined(separator: " ")
        self.init(tone: change.tone, arrow: change.arrow, amount: amount, suffix: suffix)
    }

    /// A custom trend's change in its measure, never flipped and without a percent.
    init(current: Int, previous: Int, measure: TrendMeasure, suffix: String) {
        let delta = current - previous
        self.init(tone: ChangeTone.of(deltaCents: delta, isSaving: false), arrow: delta == 0 ? "" : (delta > 0 ? "▲" : "▼"),
                  amount: measure.formatSigned(delta), suffix: suffix)
    }

    private init(tone: ChangeTone, arrow: String, amount: String, suffix: String) {
        self.tone = tone
        self.suffix = suffix
        switch tone {
        case .none:
            text = String(localized: "change.none")
            words = String(localized: "trends.change.none \(suffix)")
        case .worse:
            text = "\(arrow) \(amount)"
            words = String(localized: "trends.change.worse \(amount) \(suffix)")
        case .better:
            text = "\(arrow) \(amount)"
            words = String(localized: "trends.change.better \(amount) \(suffix)")
        }
    }
}

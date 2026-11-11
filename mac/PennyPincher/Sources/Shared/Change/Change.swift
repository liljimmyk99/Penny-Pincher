/// A current-vs-previous comparison in integer cents, ready to show: the tone
/// (colour), an arrow and a +/− sign always accompany the colour.
/// Matches `describeChange` in web/src/lib/change.ts.
struct Change: Equatable, Sendable {
    var tone: ChangeTone
    /// "▲", "▼", or "" when nothing changed.
    var arrow: String
    /// "+$12.00", "−$3.50" or "$0.00".
    var amountText: String
    /// "+10%" / "−4%", or nil when there was nothing to compare with.
    var percentText: String?
    var deltaCents: Int

    init(current: Int, previous: Int, isSaving: Bool = false) {
        let delta = current - previous
        deltaCents = delta
        tone = ChangeTone.of(deltaCents: delta, isSaving: isSaving)
        arrow = delta == 0 ? "" : (delta > 0 ? "▲" : "▼")
        amountText = Money.format(delta, showPlus: true)
        if previous > 0 && delta != 0 {
            // Whole percent, rounded half up, without floating point.
            let magnitude = delta.magnitude
            let percent = (Int(magnitude) * 200 + previous) / (previous * 2)
            percentText = "\(delta > 0 ? "+" : Money.minus)\(percent)%"
        } else {
            percentText = nil
        }
    }

    /// "▲ +$12.00 (+10%)", or "No change".
    var text: String {
        if tone == .none { return String(localized: "change.none") }
        return ["\(arrow) \(amountText)", percentText.map { "(\($0))" }].compactMap { $0 }.joined(separator: " ")
    }

    /// The change in words, for a row's accessible name.
    var words: String {
        let detail = percentText.map { " (\($0))" } ?? ""
        switch tone {
        case .none: return String(localized: "change.words.none")
        case .worse: return String(localized: "change.words.worse \(amountText) \(detail)")
        case .better: return String(localized: "change.words.better \(amountText) \(detail)")
        }
    }
}

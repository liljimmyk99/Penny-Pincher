import Foundation

extension TrendMeasure {
    var title: LocalizedStringResource {
        switch self {
        case .amount: "trends.measure.amount"
        case .count: "trends.measure.count"
        }
    }

    /// "$1,234.56" for an amount in cents, "12" for a count.
    func format(_ value: Int) -> String {
        self == .count ? String(value) : Money.format(value)
    }

    /// "+$12.00" / "−$3.50" for an amount, "+3" / "−2" for a count; zero has no sign.
    func formatSigned(_ value: Int) -> String {
        if self == .amount { return Money.format(value, showPlus: true) }
        return value > 0 ? "+\(value)" : (value < 0 ? "\(Money.minus)\(value.magnitude)" : "0")
    }
}

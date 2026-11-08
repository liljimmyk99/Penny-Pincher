import Foundation

/// The one place integer cents become display strings, and typed text becomes
/// cents (mac/AGENTS.md: money is `Int` cents, never `Double`). Matches the web
/// app's `web/src/lib/money.ts` character for character.
enum Money {
    /// Typographic minus, matching the +/− change indicators.
    static let minus = "\u{2212}"
    static let symbol = "$"

    /// The largest amount any client can show or enter: JavaScript's
    /// `Number.MAX_SAFE_INTEGER`, so the web and Mac apps agree on every value.
    static let maxCents = 9_007_199_254_740_991

    /// `123456` → `"$1,234.56"`, `-500` → `"−$5.00"`.
    /// - Parameters:
    ///   - showPlus: prefix positive amounts with "+" (zero never gets a sign).
    ///   - hideSymbol: omit the currency symbol.
    static func format(_ cents: Int, showPlus: Bool = false, hideSymbol: Bool = false) -> String {
        let magnitude = cents.magnitude
        let whole = grouped(magnitude / 100)
        let fraction = magnitude % 100
        let sign = cents < 0 ? minus : (showPlus && cents > 0 ? "+" : "")
        return "\(sign)\(hideSymbol ? "" : symbol)\(whole).\(fraction < 10 ? "0" : "")\(fraction)"
    }

    /// Parses what someone typed into a money field into cents, without any
    /// floating-point arithmetic: "12", "12.5", "$1,234.56", ".99", "−24.99".
    /// Returns nil for anything else (empty, letters, more than two decimals).
    static func parse(_ input: String) -> Int? {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if let first = text.first, first == "\u{2212}" || first == "\u{2013}" {
            text = "-" + text.dropFirst()
        }
        // Allow spaces between the sign and the symbol: "- $5" reads as "-$5".
        text = text.replacing(/^([+-]?)\s*\$\s*/) { "\($0.output.1)$" }

        guard let match = text.wholeMatch(of: /([+-]?)\$?(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d{0,2}))?/) else {
            return nil
        }
        let negative = match.output.1 == "-"
        let whole = match.output.2.replacing(",", with: "")
        let fractionText = match.output.3.map(String.init) ?? ""
        if whole.isEmpty && fractionText.isEmpty { return nil }

        guard let wholeValue = whole.isEmpty ? 0 : Int(whole) else { return nil }
        let fraction = Int(fractionText.padding(toLength: 2, withPad: "0", startingAt: 0)) ?? 0
        let (scaled, overflow) = wholeValue.multipliedReportingOverflow(by: 100)
        guard !overflow, scaled <= maxCents - fraction else { return nil }
        let cents = scaled + fraction
        return negative ? -cents : cents
    }

    /// Cents back to an editable field value: `123456` → `"1234.56"`, `-500` → `"-5.00"`.
    static func inputText(_ cents: Int) -> String {
        let magnitude = cents.magnitude
        let fraction = magnitude % 100
        return "\(cents < 0 ? "-" : "")\(magnitude / 100).\(fraction < 10 ? "0" : "")\(fraction)"
    }

    /// `1234567` → `"1,234,567"`, without depending on the user's locale.
    private static func grouped(_ value: UInt) -> String {
        let digits = Array(String(value))
        var out = ""
        for (index, digit) in digits.enumerated() {
            if index > 0 && (digits.count - index) % 3 == 0 { out.append(",") }
            out.append(digit)
        }
        return out
    }
}

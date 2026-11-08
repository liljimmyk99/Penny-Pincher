import Testing
@testable import PennyPincher

/// Same cases as web/src/lib/money.test.ts, so both clients agree.
@Suite("Money")
struct MoneyTests {
    @Test("Formats cents", arguments: [
        (0, "$0.00"), (5, "$0.05"), (100, "$1.00"), (123_456, "$1,234.56"), (100_000_000, "$1,000,000.00"),
    ])
    func formats(cents: Int, expected: String) {
        #expect(Money.format(cents) == expected)
    }

    @Test("Puts the sign before the symbol for negatives (refunds)")
    func negatives() {
        #expect(Money.format(-500) == "−$5.00")
        #expect(Money.format(-1) == "−$0.01")
    }

    @Test("Never shows a sign for zero")
    func zero() {
        #expect(Money.format(0, showPlus: true) == "$0.00")
    }

    @Test("Supports an explicit plus sign")
    func plusSign() {
        #expect(Money.format(250, showPlus: true) == "+$2.50")
        #expect(Money.format(-250, showPlus: true) == "−$2.50")
    }

    @Test("Can omit the symbol")
    func noSymbol() {
        #expect(Money.format(123_456, hideSymbol: true) == "1,234.56")
    }

    @Test("Is exact for large values")
    func largeValues() {
        #expect(Money.format(Money.maxCents) == "$90,071,992,547,409.91")
        #expect(Money.format(Int.max) == "$92,233,720,368,547,758.07")
        #expect(Money.format(Int.min) == "−$92,233,720,368,547,758.08")
    }

    @Test("Parses typed amounts", arguments: [
        ("12", 1200), ("12.5", 1250), ("12.05", 1205), ("0.01", 1), (".99", 99), ("8.", 800),
        ("$1,234.56", 123_456), ("1234.56", 123_456), ("  42.10 ", 4210), ("-24.99", -2499),
        ("−24.99", -2499), ("-$5", -500), ("+3", 300), ("0", 0),
    ])
    func parses(input: String, expected: Int) {
        #expect(Money.parse(input) == expected)
    }

    @Test("Rejects anything else", arguments: ["", " ", "abc", "1.234", "12,34", "1,2345", "$", "-", ".", "1e3", "12.3.4", "--1"])
    func rejects(input: String) {
        #expect(Money.parse(input) == nil)
    }

    @Test("Never goes through floats")
    func noFloats() {
        #expect(Money.parse("0.29") == 29)
        #expect(Money.parse("1.15") == 115)
        #expect(Money.parse("4.35") == 435)
    }

    @Test("Rejects amounts above the shareable maximum")
    func maximum() {
        #expect(Money.parse("90071992547409.91") == Money.maxCents)
        #expect(Money.parse("90071992547409.92") == nil)
        #expect(Money.parse("99999999999999999999999") == nil)
    }

    @Test("Input text round-trips", arguments: [(0, "0.00"), (5, "0.05"), (123_456, "1234.56"), (-500, "-5.00")])
    func inputText(cents: Int, expected: String) {
        #expect(Money.inputText(cents) == expected)
        #expect(Money.parse(expected) == cents)
    }
}

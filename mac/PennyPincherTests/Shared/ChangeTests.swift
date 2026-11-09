import Testing
@testable import PennyPincher

/// Change indicators (root AGENTS.md §6.11): orange = worse (spent more),
/// blue = better (spent less); for Saving the meaning flips.
@Suite("Change indicators")
struct ChangeTests {
    @Test("Ordinary spending: up is worse, down is better, equal is none",
          arguments: [(500, ChangeTone.worse), (-500, .better), (0, .none)])
    func ordinarySpending(delta: Int, tone: ChangeTone) {
        #expect(ChangeTone.of(deltaCents: delta, isSaving: false) == tone)
    }

    @Test("Saving flips the meaning: saving more is better, saving less is worse",
          arguments: [(500, ChangeTone.better), (-500, .worse), (0, .none)])
    func savingFlips(delta: Int, tone: ChangeTone) {
        #expect(ChangeTone.of(deltaCents: delta, isSaving: true) == tone)
    }

    @Test("An increase shows ▲ and a plus sign, with the percent of the previous amount")
    func increase() {
        let change = Change(current: 11_000, previous: 10_000)
        #expect(change.tone == .worse)
        #expect(change.arrow == "▲")
        #expect(change.amountText == "+$10.00")
        #expect(change.percentText == "+10%")
        #expect(change.text == "▲ +$10.00 (+10%)")
    }

    @Test("A decrease shows ▼ and a typographic minus")
    func decrease() {
        let change = Change(current: 9_650, previous: 10_000)
        #expect(change.tone == .better)
        #expect(change.arrow == "▼")
        #expect(change.amountText == "\u{2212}$3.50")
        #expect(change.percentText == "\u{2212}4%")
    }

    @Test("Saving more is blue with ▲ and +; saving less is orange with ▼ and −")
    func savingCarriesSignsToo() {
        let more = Change(current: 6_000, previous: 4_000, isSaving: true)
        #expect(more.tone == .better && more.arrow == "▲" && more.amountText.hasPrefix("+"))
        let less = Change(current: 1_000, previous: 4_000, isSaving: true)
        #expect(less.tone == .worse && less.arrow == "▼" && less.amountText.hasPrefix(Money.minus))
    }

    @Test("No change has no arrow or percent; nothing before it has no percent")
    func edges() {
        let same = Change(current: 5_000, previous: 5_000)
        #expect(same.tone == .none && same.arrow.isEmpty && same.percentText == nil && same.amountText == "$0.00")
        let fresh = Change(current: 5_000, previous: 0)
        #expect(fresh.percentText == nil && fresh.tone == .worse)
    }

    @Test("Percent rounds half up without floating point")
    func rounding() {
        #expect(Change(current: 10_050, previous: 10_000).percentText == "+1%")   // 0.5% rounds up
        #expect(Change(current: 10_049, previous: 10_000).percentText == "+0%")
    }

    @Test("Shares are whole percents, or a dash without a whole")
    func shares() {
        #expect(Percent.share(1_000, of: 3_000) == "33%")
        #expect(Percent.share(1_500, of: 3_000) == "50%")
        #expect(Percent.share(1, of: 0) == "—")
    }
}

import Testing
@testable import PennyPincher

@Suite("Refunds")
struct RefundsTests {
    let original = Fixture.expense("e1", "2026-10-05", 5_000)

    @Test("Tags: not linked, full, partial, from an earlier month")
    func tags() {
        #expect(Refunds.tag(Fixture.expense("r", "2026-10-09", -500), original: nil) == .unlinked)
        let linked = Fixture.expense("r", "2026-10-09", -5_000, refunds: "e1")
        #expect(Refunds.tag(linked, original: nil) == nil)
        #expect(Refunds.tag(linked, original: original) == .full)
        #expect(Refunds.tag(Fixture.expense("r", "2026-10-09", -1_000, refunds: "e1"), original: original) == .partial)
        #expect(Refunds.tag(Fixture.expense("r", "2026-11-02", -1_000, refunds: "e1"), original: original) == .earlier("October"))
        #expect(Refunds.tag(Fixture.expense("r", "2027-01-02", -1_000, refunds: "e1"), original: original)
            == .earlier("October 2026"))
        #expect(RefundTag.earlier("October").text == "From October")
    }

    @Test("Original status: refunded in full or partly")
    func status() throws {
        #expect(Refunds.status(original) == nil)
        let full = try #require(Refunds.status(Fixture.expense("e", "2026-10-05", 5_000, refundedTotal: -5_000,
                                                               lastRefund: "2026-10-09")))
        #expect(full.full)
        #expect(full.text == "Refunded in full on Oct 9 · net $0.00")
        let partial = try #require(Refunds.status(Fixture.expense("e", "2026-10-05", 5_000, refundedTotal: -1_250,
                                                                  lastRefund: "2026-10-09")))
        #expect(!partial.full)
        #expect(partial.netCents == 3_750)
        #expect(partial.text == "Partly refunded · −$12.50 on Oct 9 · net $37.50")
    }

    @Test("Totals before and after refunds")
    func totals() {
        let totals = Refunds.totals([
            Fixture.expense("a", "2026-10-01", 10_000),
            Fixture.expense("b", "2026-10-02", -2_000, refunds: "a"),
            Fixture.expense("c", "2026-10-03", -500),
        ])
        #expect(totals == RefundTotals(refundCents: -2_500, refundCount: 2, linkedCount: 1, beforeCents: 10_000))
        #expect(totals.afterCents == 7_500)
    }

    @Test("Suggests the closest earlier expense in the category that still covers the refund")
    func suggestion() {
        let refund = Fixture.expense("r", "2026-10-20", -3_000)
        let candidates = [
            Fixture.expense("later", "2026-10-21", 9_000),
            Fixture.expense("otherCategory", "2026-10-19", 9_000, category: Fixture.fun.id),
            Fixture.expense("tooSmall", "2026-10-18", 2_000),
            Fixture.expense("used", "2026-10-17", 4_000, refundedTotal: -2_000),
            Fixture.expense("best", "2026-10-15", 3_000),
            Fixture.expense("older", "2026-10-01", 5_000),
        ]
        #expect(Refunds.suggestion(for: refund, among: candidates)?.id == "best")
        #expect(Refunds.describe(candidates[4]) == "Corner Store · Oct 15 · $30.00")
    }
}

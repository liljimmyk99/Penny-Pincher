/// How refunds read (web/src/pages/transactions/refunds.ts). Display only: an
/// original's net is `amountCents + refundedTotalCents`, never stored.
enum Refunds {
    /// "From <Month>" wins when the original is in an earlier month (with the
    /// year when it differs); otherwise the refund is full when it covers the
    /// original's whole amount. Nil while a linked original loads.
    static func tag(_ refund: Expense, original: Expense?) -> RefundTag? {
        guard refund.refundedExpenseID != nil else { return .unlinked }
        guard let original else { return nil }
        let from = CalendarDate.month(of: original.date)
        let to = CalendarDate.month(of: refund.date)
        if from < to {
            let name = CalendarDate.monthName(from)
            return .earlier(from.prefix(4) == to.prefix(4) ? name : "\(name) \(from.prefix(4))")
        }
        return -refund.amountCents >= original.amountCents ? .full : .partial
    }

    /// "Corner Store · Mar 12 · $50.00": what a refund's "Refund for" reads.
    static func describe(_ original: Expense) -> String {
        "\(original.merchant.name) · \(CalendarDate.shortDate(original.date)) · \(Money.format(original.amountCents))"
    }

    /// What happened to an expense that refunds point at; nil when none do.
    static func status(_ expense: Expense) -> OriginalStatus? {
        guard !expense.isRefund, expense.refundedTotalCents != 0 else { return nil }
        let net = expense.netCents
        let netText = Money.format(net)
        let date = expense.lastRefundDate.map(CalendarDate.shortDate)
        if net <= 0 {
            let text = date.map { String(localized: "refund.original.full.on \($0) \(netText)") }
                ?? String(localized: "refund.original.full \(netText)")
            return OriginalStatus(full: true, text: text, netCents: net)
        }
        let refunded = Money.format(expense.refundedTotalCents)
        let text = date.map { String(localized: "refund.original.partial.on \(refunded) \($0) \(netText)") }
            ?? String(localized: "refund.original.partial \(refunded) \(netText)")
        return OriginalStatus(full: false, text: text, netCents: net)
    }

    static func totals(_ expenses: [Expense]) -> RefundTotals {
        var totals = RefundTotals()
        for expense in expenses {
            if expense.isRefund {
                totals.refundCents += expense.amountCents
                totals.refundCount += 1
                if expense.refundedExpenseID != nil { totals.linkedCount += 1 }
            } else {
                totals.beforeCents += expense.amountCents
            }
        }
        return totals
    }

    /// The Suggested match when linking: an expense in the refund's category,
    /// dated on or before it, with enough left after earlier refunds to cover
    /// it; the closest one before the refund wins. Candidates arrive newest
    /// first, so ties keep the most recent.
    static func suggestion(for refund: Expense, among candidates: [Expense]) -> Expense? {
        var best: Expense?
        for candidate in candidates {
            guard !candidate.isRefund, candidate.id != refund.id, candidate.categoryID == refund.categoryID,
                  candidate.date <= refund.date, candidate.netCents >= -refund.amountCents else { continue }
            if best.map({ candidate.date > $0.date }) ?? true { best = candidate }
        }
        return best
    }
}

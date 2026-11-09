/// The one tag on a refund row (web/AGENTS.md "Refunds").
enum RefundTag: Equatable, Sendable {
    case full
    case partial
    /// The original is in an earlier month; the text names it ("From March", or "From March 2025").
    case earlier(String)
    case unlinked

    var text: String {
        switch self {
        case .full: String(localized: "refund.tag.full")
        case .partial: String(localized: "refund.tag.partial")
        case .earlier(let month): String(localized: "refund.tag.from \(month)")
        case .unlinked: String(localized: "refund.tag.unlinked")
        }
    }
}

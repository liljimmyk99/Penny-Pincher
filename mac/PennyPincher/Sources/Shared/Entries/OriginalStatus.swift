/// What happened to an expense that refunds point at.
struct OriginalStatus: Equatable, Sendable {
    /// Refunds cover the whole amount, so the amount is struck through.
    var full: Bool
    var text: String
    var netCents: Int
}

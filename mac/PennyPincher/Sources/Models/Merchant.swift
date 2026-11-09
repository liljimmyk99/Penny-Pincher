/// A merchant, stored per user and matched case-insensitively.
struct Merchant: Identifiable, Equatable, Hashable, Sendable {
    var id: String
    var name: String
}

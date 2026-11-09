/// Where income comes from (`IncomeSource`). "Other" is protected; a source
/// with entries can be renamed but never deleted.
struct IncomeSource: Identifiable, Equatable, Hashable, Sendable {
    var id: String
    var name: String
    var isProtected: Bool
    var hasEntries: Bool
    var sortOrder: Int
}

/// Entry counts and totals for one category (`CategoryStats`): the count and
/// `totalCents` are all time (what deleting it moves to Other); `yearTotalCents`
/// is the requested year only.
struct CategoryStats: Equatable, Sendable {
    var categoryID: String
    var entryCount: Int
    var totalCents: Int
    var yearTotalCents: Int
}

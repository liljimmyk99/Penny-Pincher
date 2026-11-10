/// `GET /v1/trends/custom`, grouped by month. Filters combine with AND; at
/// least one of `categoryID`, `merchantID` and `text` is set.
struct CustomTrendQuery: Equatable, Hashable, Sendable {
    var categoryID: String?
    var merchantID: String?
    /// Case-insensitive substring of the note.
    var text: String?
    /// `YYYY-MM-DD`, inclusive.
    var from: String
    var to: String
}

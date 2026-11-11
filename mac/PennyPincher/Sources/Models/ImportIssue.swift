/// One problem row found by the check. `code` is the API's stable code.
struct ImportIssue: Equatable, Sendable {
    enum Sheet: String, Sendable { case expenses, income }

    var sheet: Sheet
    var row: Int
    var column: String
    var code: String
    var value: String
    var message: String
}

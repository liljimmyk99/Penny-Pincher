import Foundation

/// One row of the import history.
struct ImportSummary: Equatable, Identifiable, Sendable {
    var id: String
    var fileName: String
    var status: ImportStatus
    var createdAt: Date
    var finishedAt: Date?
    var firstMonth: String?
    var lastMonth: String?
    var rowsReady: Int
    var rowsWithProblems: Int
    var entriesImported: Int
}

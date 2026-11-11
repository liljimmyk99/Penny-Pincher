/// An import with its check results and progress (`Import` in api/openapi.yaml).
struct ImportDetail: Equatable, Identifiable, Sendable {
    struct ExistingMonth: Equatable, Identifiable, Sendable {
        var month: String
        var existingEntries: Int
        var fileEntries: Int
        var id: String { month }
    }

    var summary: ImportSummary
    var expenseRows: Int
    var incomeRows: Int
    var years: [ImportYear]
    var monthsWithExistingEntries: [ExistingMonth]
    var issues: [ImportIssue]
    var issuesTruncated: Bool
    var progress: ImportProgress?
    var failureReason: String?

    var id: String { summary.id }
    var status: ImportStatus { summary.status }
    var rowsFound: Int { expenseRows + incomeRows }
}

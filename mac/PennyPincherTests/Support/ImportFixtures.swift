import Foundation
@testable import PennyPincher

enum ImportFixtures {
    static func summary(_ status: ImportStatus = .review, entries: Int = 0) -> ImportSummary {
        ImportSummary(id: "i1", fileName: "history.xlsx", status: status, createdAt: Date(timeIntervalSince1970: 0),
                      finishedAt: nil, firstMonth: "2023-01", lastMonth: "2024-06", rowsReady: 10, rowsWithProblems: 3,
                      entriesImported: entries)
    }

    static var review: ImportDetail {
        ImportDetail(
            summary: summary(),
            expenseRows: 11, incomeRows: 2,
            years: [ImportYear(year: 2023, months: 12, expenseRows: 6, incomeRows: 1, spentCents: 12_345, rowsWithProblems: 2)],
            monthsWithExistingEntries: [.init(month: "2024-03", existingEntries: 4, fileEntries: 2)],
            issues: (1...7).map {
                ImportIssue(sheet: .expenses, row: $0 + 1, column: "Category", code: "unknown_category", value: "x", message: "m")
            } + [ImportIssue(sheet: .income, row: 5, column: "Date", code: "invalid_date", value: "?", message: "bad date")],
            issuesTruncated: false, progress: nil, failureReason: nil)
    }

    static func progress(done: Int = 5) -> ImportProgress {
        ImportProgress(status: .running, rowsDone: done, rowsTotal: 10, currentMonth: "2023-03", etaSeconds: 90,
                       years: [.init(year: 2023, rowsDone: done, rowsTotal: 10)])
    }

    static func detail(_ status: ImportStatus, entries: Int = 0) -> ImportDetail {
        var detail = review
        detail.summary = summary(status, entries: entries)
        return detail
    }
}

/// A scripted event source: each call to `events` plays the next script.
final class ScriptedEvents: ImportEventSource, @unchecked Sendable {
    enum Step: Sendable { case event(ImportEvent), drop }

    private let lock = NSLock()
    private var scripts: [[Step]]
    private(set) var connections = 0

    init(_ scripts: [[Step]]) { self.scripts = scripts }

    func events(importID: String) -> AsyncThrowingStream<ImportEvent, any Error> {
        let script: [Step] = lock.withLock {
            connections += 1
            return scripts.isEmpty ? [] : scripts.removeFirst()
        }
        return AsyncThrowingStream { continuation in
            for step in script {
                switch step {
                case .event(let event): continuation.yield(event)
                case .drop: continuation.finish(throwing: APIError.network())
                }
            }
            continuation.finish()
        }
    }
}

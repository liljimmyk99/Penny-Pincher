import Foundation
import Observation

/// The Import screen: download the template, upload and review a file, start
/// it, and the history. A running import itself is followed by `ImportTracker`.
@MainActor
@Observable
final class ImportViewModel {
    /// Rows listed per problem group before "+ N more".
    static let referencesShown = 5
    static let maxFileBytes = 10 * 1024 * 1024

    @ObservationIgnored private let api: ImportsAPI
    @ObservationIgnored private let saver: FileSaver
    @ObservationIgnored private let readFile: @MainActor (URL) throws -> Data
    let tracker: ImportTracker

    /// The checked file waiting for the person's go-ahead.
    private(set) var reviewing: ImportDetail?
    private(set) var history: [ImportSummary] = []
    private(set) var isBusy = false
    private(set) var errorMessage: String?
    private(set) var statusMessage: String?
    var isConfirmingCancel = false
    var undoCandidate: ImportSummary?
    /// Set by the window: "Open Yearly" after a finished import.
    @ObservationIgnored var openYearly: () -> Void = {}

    init(api: ImportsAPI, tracker: ImportTracker, saver: FileSaver = .savePanel,
         readFile: @escaping @MainActor (URL) throws -> Data = ImportViewModel.readSelectedFile) {
        self.api = api
        self.tracker = tracker
        self.saver = saver
        self.readFile = readFile
    }

    /// Reads a file the person picked (the sandbox needs the security scope).
    static func readSelectedFile(_ url: URL) throws -> Data {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        return try Data(contentsOf: url)
    }

    // MARK: Stage

    var stage: ImportStage {
        if tracker.running != nil { return .importing }
        if tracker.finished != nil { return .finished }
        if reviewing != nil { return .review }
        return .upload
    }

    var showsHistory: Bool { stage == .upload || stage == .finished }

    // MARK: Loading

    func load() async {
        do {
            history = try await api.listImports(status: nil).filter { $0.status != .review }
        } catch {
            errorMessage = error.message
        }
    }

    // MARK: Template and upload

    func downloadTemplate() async {
        await perform {
            let file = try await api.downloadImportTemplate()
            if try saver.save(file) { statusMessage = String(localized: "import.status.templateSaved") }
        }
    }

    /// Reads, uploads and checks a picked `.xlsx`. Nothing is saved until the person starts it.
    func upload(url: URL) async {
        guard url.pathExtension.lowercased() == "xlsx" else {
            errorMessage = String(localized: "import.error.notXLSX")
            return
        }
        await perform {
            let data: Data
            do { data = try readFile(url) } catch {
                errorMessage = String(localized: "import.error.unreadable")
                return
            }
            guard data.count <= Self.maxFileBytes else {
                errorMessage = String(localized: "import.error.tooLarge")
                return
            }
            let detail = try await api.uploadImport(fileName: url.lastPathComponent, data: data)
            tracker.clearFinished()
            reviewing = detail
        }
    }

    /// "Choose a different file": discards the checked import.
    func chooseDifferentFile() async {
        guard let reviewing else { return }
        await perform {
            try await api.discardImport(id: reviewing.id)
            self.reviewing = nil
        }
    }

    func dismissMessage() {
        errorMessage = nil
        statusMessage = nil
    }

    func downloadReviewProblems() async {
        if let id = reviewing?.id { await downloadProblems(id: id) }
    }

    func downloadSkippedRows() async {
        if let id = tracker.finished?.id { await downloadProblems(id: id) }
    }

    func downloadProblems(id: String) async {
        await perform {
            let file = try await api.downloadImportProblems(id: id)
            if try saver.save(file) { statusMessage = String(localized: "import.status.problemsSaved") }
        }
    }

    // MARK: Review

    var fileName: String { reviewing?.summary.fileName ?? "" }
    var rowsFound: Int { reviewing?.rowsFound ?? 0 }
    var rowsReady: Int { reviewing?.summary.rowsReady ?? 0 }
    var rowsWithProblems: Int { reviewing?.summary.rowsWithProblems ?? 0 }
    var years: [ImportYear] { reviewing?.years ?? [] }
    var canStart: Bool { rowsReady > 0 && !isBusy }

    var dateRange: String {
        guard let first = reviewing?.summary.firstMonth, let last = reviewing?.summary.lastMonth else { return "—" }
        let start = CalendarDate.shortMonthName(first) + " " + String(CalendarDate.year(of: first))
        let end = CalendarDate.shortMonthName(last) + " " + String(CalendarDate.year(of: last))
        return first == last ? start : "\(start) – \(end)"
    }

    var startTitle: String { String(localized: "import.review.start \(rowsReady)") }

    /// nil when no month in the file already has entries.
    var existingMonthsWarning: String? {
        guard let months = reviewing?.monthsWithExistingEntries, !months.isEmpty else { return nil }
        let names = months.map { CalendarDate.monthTitle($0.month) }.joined(separator: ", ")
        return String(localized: "import.review.existing \(names)")
    }

    var problemGroups: [ImportProblemGroup] {
        guard let issues = reviewing?.issues else { return [] }
        var order: [String] = []
        var byCode: [String: [ImportIssue]] = [:]
        for issue in issues {
            if byCode[issue.code] == nil { order.append(issue.code) }
            byCode[issue.code, default: []].append(issue)
        }
        return order.map { code in
            let list = byCode[code] ?? []
            return ImportProblemGroup(
                code: code,
                title: ImportIssueText.title(code, fallback: list.first?.message ?? code),
                hint: ImportIssueText.hint(code),
                count: list.count,
                references: Self.references(list)
            )
        }
    }

    var hasMoreProblemsThanListed: Bool { reviewing?.issuesTruncated ?? false }

    static func references(_ issues: [ImportIssue]) -> String {
        let shown = issues.prefix(referencesShown).map { issue in
            let sheet = issue.sheet == .expenses ? String(localized: "import.sheet.expenses") : String(localized: "import.sheet.income")
            return String(localized: "import.reference \(sheet) \(issue.row)")
        }.joined(separator: ", ")
        let more = issues.count - referencesShown
        return more > 0 ? shown + " " + String(localized: "import.reference.more \(more)") : shown
    }

    // MARK: Run

    func startImport() async {
        guard let reviewing, canStart else { return }
        await perform {
            try await tracker.start(reviewing)
            self.reviewing = nil
        }
    }

    func cancelImport() async {
        isConfirmingCancel = false
        await perform { try await tracker.cancel() }
        await load()
    }

    func importAnother() {
        tracker.clearFinished()
        reviewing = nil
        Task { await load() }
    }

    func askUndo(_ summary: ImportSummary) { undoCandidate = summary }

    func undo() async {
        guard let candidate = undoCandidate else { return }
        undoCandidate = nil
        await perform {
            let undone = try await api.undoImport(id: candidate.id)
            tracker.replaceFinished(undone)
            statusMessage = String(localized: "import.status.undone")
        }
        await load()
    }

    // MARK: Progress text

    var progress: ImportProgress? { tracker.progress ?? tracker.running?.progress }
    var percentText: String { String(localized: "import.progress.percent \(progress?.percent ?? 0)") }

    var entriesText: String {
        String(localized: "import.progress.entries \(progress?.rowsDone ?? 0) \(progress?.rowsTotal ?? 0)")
    }

    var monthText: String? {
        progress?.currentMonth.map { String(localized: "import.progress.month \(CalendarDate.monthTitle($0))") }
    }

    var timeLeftText: String? { Self.timeLeft(progress?.etaSeconds) }

    static func timeLeft(_ seconds: Int?) -> String? {
        guard let seconds else { return nil }
        if seconds < 5 { return String(localized: "import.progress.almostDone") }
        if seconds < 60 { return String(localized: "import.progress.secondsLeft \(seconds)") }
        let minutes = (seconds + 59) / 60
        return String(localized: "import.progress.minutesLeft \(minutes)")
    }

    // MARK: Finished

    var finishedTitle: String {
        guard let finished = tracker.finished else { return "" }
        return switch finished.status {
        case .completed: String(localized: "import.finished.completed")
        case .cancelled: String(localized: "import.finished.cancelled")
        default: String(localized: "import.finished.failed")
        }
    }

    var finishedDetail: String {
        guard let finished = tracker.finished else { return "" }
        switch finished.status {
        case .completed:
            return String(localized: "import.finished.counts \(finished.summary.entriesImported) \(finished.summary.rowsWithProblems)")
        case .failed:
            return finished.failureReason ?? String(localized: "import.finished.nothingSaved")
        default:
            return String(localized: "import.finished.nothingSaved")
        }
    }

    var canDownloadSkipped: Bool { (tracker.finished?.summary.rowsWithProblems ?? 0) > 0 }

    private func perform(_ work: () async throws -> Void) async {
        guard !isBusy else { return }
        isBusy = true
        errorMessage = nil
        statusMessage = nil
        defer { isBusy = false }
        do {
            try await work()
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = String(localized: "import.error.save")
        }
    }
}

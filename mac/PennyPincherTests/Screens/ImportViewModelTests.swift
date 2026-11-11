import Foundation
import Testing
@testable import PennyPincher

@MainActor
@Suite("Import view model")
struct ImportViewModelTests {
    private final class Saved: @unchecked Sendable { var files: [ExportFile] = [] }

    private func make(_ api: FakeLedgerAPI = FakeLedgerAPI(), events: ScriptedEvents = ScriptedEvents([]),
                      saved: Saved = Saved(), data: Data = Data(count: 10)) -> ImportViewModel {
        let tracker = ImportTracker(api: api, source: events, retryDelay: .milliseconds(1))
        return ImportViewModel(api: api, tracker: tracker, saver: FileSaver { saved.files.append($0); return true },
                               readFile: { _ in data })
    }

    private let file = URL(filePath: "/tmp/history.xlsx")

    @Test("Starts on the upload stage and saves the template through the save panel")
    func template() async {
        let saved = Saved()
        let viewModel = make(saved: saved)
        #expect(viewModel.stage == .upload && viewModel.showsHistory)
        await viewModel.downloadTemplate()
        #expect(saved.files.map(\.fileName) == ["template.xlsx"])
        #expect(viewModel.statusMessage != nil && viewModel.errorMessage == nil)
    }

    @Test("Upload moves to review with tiles, range, existing-months warning and grouped problems")
    func review() async {
        let api = FakeLedgerAPI()
        let viewModel = make(api)
        await viewModel.upload(url: file)
        #expect(api.with { $0.uploadedFiles.map(\.name) } == ["history.xlsx"])
        #expect(viewModel.stage == .review)
        #expect(viewModel.rowsFound == 13 && viewModel.rowsReady == 10 && viewModel.rowsWithProblems == 3)
        #expect(viewModel.dateRange.contains("2023") && viewModel.dateRange.contains("2024"))
        #expect(viewModel.existingMonthsWarning?.contains("March 2024") == true)
        let groups = viewModel.problemGroups
        #expect(groups.map(\.code) == ["unknown_category", "invalid_date"])
        #expect(groups[0].count == 7)
        #expect(groups[0].references.hasSuffix("+ 2 more"))
        #expect(groups[1].references.contains("5"))
        #expect(viewModel.canStart)
    }

    @Test("Only .xlsx files up to 10 MB are uploaded")
    func limits() async {
        let api = FakeLedgerAPI()
        let viewModel = make(api)
        await viewModel.upload(url: URL(filePath: "/tmp/a.csv"))
        #expect(viewModel.errorMessage != nil && viewModel.stage == .upload)
        let big = make(api, data: Data(count: ImportViewModel.maxFileBytes + 1))
        await big.upload(url: file)
        #expect(big.errorMessage != nil && api.with { $0.uploadedFiles.isEmpty })
    }

    @Test("A rejected file shows the server's message and stays on upload")
    func rejected() async {
        let api = FakeLedgerAPI()
        api.with { $0.failures["uploadImport"] = APIError.code("invalid_import_file", status: 400) }
        let viewModel = make(api)
        await viewModel.upload(url: file)
        #expect(viewModel.stage == .upload && viewModel.errorMessage != nil)
    }

    @Test("Choosing a different file discards the import")
    func discard() async {
        let api = FakeLedgerAPI()
        let viewModel = make(api)
        await viewModel.upload(url: file)
        await viewModel.chooseDifferentFile()
        #expect(viewModel.stage == .upload && api.calls.contains("discardImport"))
    }

    @Test("Problem rows are fetched and saved")
    func problems() async {
        let saved = Saved()
        let viewModel = make(saved: saved)
        await viewModel.upload(url: file)
        await viewModel.downloadReviewProblems()
        #expect(saved.files.count == 1)
    }

    @Test("Start → importing (with progress text) → finished; Import another resets")
    func run() async {
        let api = FakeLedgerAPI()
        let done = ImportFixtures.detail(.completed, entries: 10)
        let events = ScriptedEvents([[.event(.progress(ImportFixtures.progress())), .event(.finished(done))]])
        let viewModel = make(api, events: events)
        await viewModel.upload(url: file)
        #expect(viewModel.startTitle.contains("10"))
        await viewModel.startImport()
        #expect(api.calls.contains("startImport") && viewModel.tracker.running != nil)
        #expect(viewModel.stage == .importing)
        await viewModel.tracker.followTask?.value
        await settle()
        #expect(viewModel.stage == .finished)
        #expect(viewModel.finishedTitle.isEmpty == false && viewModel.canDownloadSkipped)
        viewModel.importAnother()
        #expect(viewModel.stage == .upload)
    }

    @Test("Progress text: percent, entries, month and time left")
    func progressText() async {
        let viewModel = make()
        viewModel.tracker.preview(running: { var d = ImportFixtures.detail(.running); d.progress = ImportFixtures.progress(); return d }())
        #expect(viewModel.percentText.contains("50"))
        #expect(viewModel.entriesText.contains("5") && viewModel.entriesText.contains("10"))
        #expect(viewModel.monthText?.contains("March 2023") == true)
        #expect(viewModel.timeLeftText?.contains("2") == true)   // 90 s → about 2 min
        #expect(ImportViewModel.timeLeft(nil) == nil)
        #expect(ImportViewModel.timeLeft(3) != ImportViewModel.timeLeft(30))
    }

    @Test("Cancelling asks first, then rolls back")
    func cancel() async {
        let api = FakeLedgerAPI()
        let viewModel = make(api, events: ScriptedEvents([[]]))
        await viewModel.upload(url: file)
        await viewModel.startImport()
        viewModel.isConfirmingCancel = true
        await viewModel.cancelImport()
        #expect(!viewModel.isConfirmingCancel && api.calls.contains("cancelImport"))
        #expect(viewModel.tracker.running == nil)
    }

    @Test("History lists finished imports; Undo needs confirmation")
    func undo() async {
        let api = FakeLedgerAPI()
        api.with { $0.importHistory = [ImportFixtures.summary(.completed, entries: 10), ImportFixtures.summary(.review)] }
        let viewModel = make(api)
        await viewModel.load()
        #expect(viewModel.history.map(\.status) == [.completed])
        viewModel.askUndo(viewModel.history[0])
        #expect(viewModel.undoCandidate != nil)
        await viewModel.undo()
        #expect(api.calls.contains("undoImport") && viewModel.undoCandidate == nil)
        #expect(viewModel.statusMessage != nil)
    }
}

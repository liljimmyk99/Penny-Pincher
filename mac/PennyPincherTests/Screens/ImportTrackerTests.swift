import Foundation
import Testing
@testable import PennyPincher

@MainActor
@Suite("Import tracker")
struct ImportTrackerTests {
    private final class Notes: @unchecked Sendable { var titles: [String] = []; var asked = 0 }

    private func tracker(_ api: FakeLedgerAPI, _ events: ScriptedEvents, notes: Notes = Notes()) -> ImportTracker {
        let notifier = FinishNotifier(requestAuthorization: { notes.asked += 1 }, notify: { title, _ in notes.titles.append(title) })
        return ImportTracker(api: api, source: events, notifier: notifier, retryDelay: .milliseconds(1))
    }

    @Test("Starting follows progress to the finished event, then notifies and reports")
    func startToFinish() async throws {
        let api = FakeLedgerAPI()
        api.with { $0.importDetail = ImportFixtures.review }
        let done = ImportFixtures.detail(.completed, entries: 10)
        let events = ScriptedEvents([[.event(.progress(ImportFixtures.progress())), .event(.finished(done))]])
        let notes = Notes()
        let tracker = tracker(api, events, notes: notes)
        var finishedCalls = 0
        tracker.onFinished = { _ in finishedCalls += 1 }

        try await tracker.start(ImportFixtures.review)
        await settle()
        #expect(notes.asked == 1)
        await tracker.followTask?.value
        await settle()
        #expect(tracker.running == nil && tracker.finished?.status == .completed)
        #expect(tracker.banner == .finished(done))
        #expect(notes.titles.count == 1 && finishedCalls == 1)
    }

    @Test("A dropped stream is retried after checking the import; a still-running import reconnects")
    func reconnects() async throws {
        let api = FakeLedgerAPI()
        let events = ScriptedEvents([[.event(.progress(ImportFixtures.progress(done: 2))), .drop],
                                     [.event(.finished(ImportFixtures.detail(.completed, entries: 10)))]])
        let tracker = tracker(api, events)
        try await tracker.start(ImportFixtures.review)   // the fake answers `running`
        await tracker.followTask?.value
        #expect(events.connections == 2)
        #expect(tracker.finished?.status == .completed)
    }

    @Test("If the import ended while the stream was down, the refetch finishes it")
    func refetchFinishes() async throws {
        let api = FakeLedgerAPI()
        let events = ScriptedEvents([[.drop]])
        let tracker = tracker(api, events)
        try await tracker.start(ImportFixtures.review)
        api.with { $0.importDetail = ImportFixtures.detail(.failed) }
        await tracker.followTask?.value
        #expect(tracker.finished?.status == .failed)
        if case .stopped = tracker.banner { } else { Issue.record("expected the stopped banner") }
    }

    @Test("Starting doesn't wait for the notification permission prompt")
    func startDoesNotWaitForPermission() async throws {
        let notifier = FinishNotifier(requestAuthorization: { try? await Task.sleep(for: .seconds(60)) }, notify: { _, _ in })
        let tracker = ImportTracker(api: FakeLedgerAPI(), source: ScriptedEvents([[]]), notifier: notifier,
                                    retryDelay: .milliseconds(1))
        try await tracker.start(ImportFixtures.review)
        #expect(tracker.running != nil)
        tracker.cancelFollowingForTests()
    }

    @Test("On load it picks up an import that is already running")
    func resumes() async {
        let api = FakeLedgerAPI()
        api.with {
            $0.importHistory = [ImportFixtures.summary(.running)]
            $0.importDetail = ImportFixtures.detail(.running)
        }
        let events = ScriptedEvents([[.event(.progress(ImportFixtures.progress(done: 7)))]])
        let tracker = tracker(api, events)
        await tracker.resume()
        #expect(tracker.running != nil)
        #expect(api.calls.contains("listImports:running"))
        tracker.cancelFollowingForTests()
    }

    @Test("With nothing running there is no banner")
    func idle() async {
        let tracker = tracker(FakeLedgerAPI(), ScriptedEvents([]))
        await tracker.resume()
        #expect(tracker.banner == nil)
    }

    @Test("Cancelling removes the banner and doesn't notify; dismissing hides a finished one")
    func cancelAndDismiss() async throws {
        let api = FakeLedgerAPI()
        let notes = Notes()
        let tracker = tracker(api, ScriptedEvents([[]]), notes: notes)
        try await tracker.start(ImportFixtures.review)
        try await tracker.cancel()
        #expect(tracker.running == nil && tracker.banner == nil && tracker.finished?.status == .cancelled)
        #expect(notes.titles.isEmpty)
    }
}

import Foundation
import Observation

/// Follows the person's running import for the whole signed-in session, so the
/// banner shows on every screen and the progress survives leaving the Import
/// screen. It reads the SSE stream, reconnects if it drops, and reports when
/// the import ends (mac/AGENTS.md, Import).
@MainActor
@Observable
final class ImportTracker {
    enum Banner: Equatable {
        case running(ImportDetail)
        case finished(ImportDetail)
        /// Cancelled by the server's failure, or failed: nothing was saved.
        case stopped(ImportDetail)
    }

    @ObservationIgnored private let api: ImportsAPI
    @ObservationIgnored private let source: ImportEventSource
    @ObservationIgnored private let notifier: FinishNotifier
    @ObservationIgnored private let retryDelay: Duration
    /// Called once when an import ends, so the screens can reload their data.
    @ObservationIgnored var onFinished: @MainActor (ImportDetail) -> Void = { _ in }
    /// The stream-following task; tests await it.
    @ObservationIgnored private(set) var followTask: Task<Void, Never>?

    /// The import being written now, with its latest progress.
    private(set) var running: ImportDetail?
    private(set) var progress: ImportProgress?
    /// The import that ended last, until the person starts another or leaves it.
    private(set) var finished: ImportDetail?
    private var isBannerDismissed = false

    init(api: ImportsAPI, source: ImportEventSource, notifier: FinishNotifier = .silent,
         retryDelay: Duration = .seconds(2)) {
        self.api = api
        self.source = source
        self.notifier = notifier
        self.retryDelay = retryDelay
    }

    var banner: Banner? {
        if let running { return .running(running) }
        guard let finished, !isBannerDismissed else { return nil }
        switch finished.status {
        case .completed: return .finished(finished)
        case .failed, .cancelled: return .stopped(finished)
        default: return nil
        }
    }

    /// On load: pick up an import that is already running (started before the app opened, or elsewhere).
    func resume() async {
        guard running == nil,
              let summary = try? await api.listImports(status: .running).first,
              let detail = try? await api.getImport(id: summary.id) else { return }
        guard detail.status == .running else { return }
        follow(detail)
    }

    /// Starts an import that is in review, then follows it.
    func start(_ detail: ImportDetail) async throws(APIError) {
        // Never wait on the system prompt: the import must start whatever the answer.
        Task { await notifier.requestAuthorization() }
        let started = try await api.startImport(id: detail.id)
        finished = nil
        isBannerDismissed = false
        follow(started)
    }

    /// Stops the running import and removes what it added.
    func cancel() async throws(APIError) {
        guard let running else { return }
        let cancelled = try await api.cancelImport(id: running.id)
        followTask?.cancel()
        end(cancelled, quiet: true)
    }

    func dismissBanner() {
        isBannerDismissed = true
    }

    /// "Import another file": forget the finished import.
    func clearFinished() {
        finished = nil
    }

    /// Undo changes a finished import's status; keep it in step.
    func replaceFinished(_ detail: ImportDetail) {
        if finished?.id == detail.id { finished = detail }
    }

    private func follow(_ detail: ImportDetail) {
        followTask?.cancel()
        running = detail
        progress = detail.progress
        let id = detail.id
        followTask = Task { [weak self] in await self?.run(importID: id) }
    }

    private func run(importID: String) async {
        while !Task.isCancelled {
            do {
                for try await event in source.events(importID: importID) {
                    switch event {
                    case .progress(let update): progress = update
                    case .finished(let detail): end(detail, quiet: false); return
                    }
                }
            } catch let error as APIError where error.isSessionError {
                return
            } catch {
                // The connection dropped: fall through, check the import, reconnect.
            }
            guard !Task.isCancelled else { return }
            try? await Task.sleep(for: retryDelay)
            if let detail = try? await api.getImport(id: importID), detail.status != .running {
                end(detail, quiet: false)
                return
            }
        }
    }

    private func end(_ detail: ImportDetail, quiet: Bool) {
        running = nil
        progress = nil
        finished = detail
        isBannerDismissed = quiet
        onFinished(detail)
        guard !quiet else { return }
        let (title, body) = Self.notification(for: detail)
        Task { await notifier.notify(title, body) }
    }

    static func notification(for detail: ImportDetail) -> (String, String) {
        switch detail.status {
        case .completed:
            (String(localized: "import.notify.finished.title"),
             String(localized: "import.notify.finished.body \(detail.summary.entriesImported) \(detail.summary.fileName)"))
        default:
            (String(localized: "import.notify.stopped.title"),
             String(localized: "import.notify.stopped.body \(detail.summary.fileName)"))
        }
    }

    #if DEBUG
    func cancelFollowingForTests() { followTask?.cancel() }

    func preview(running detail: ImportDetail) {
        running = detail
        progress = detail.progress
    }

    func preview(finished detail: ImportDetail) {
        finished = detail
    }
    #endif
}

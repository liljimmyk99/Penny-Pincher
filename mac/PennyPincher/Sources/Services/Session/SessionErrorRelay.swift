/// Carries a session error from the API middleware (any thread) to the
/// session on the main actor. Holds the session weakly.
final class SessionErrorRelay: Sendable {
    nonisolated(unsafe) private weak var _session: SessionService?

    @MainActor var session: SessionService? {
        get { _session }
        set { _session = newValue }
    }

    nonisolated func send(_ error: APIError) {
        Task { @MainActor in self.session?.end(error) }
    }
}

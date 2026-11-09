/// Where a screen's first load stands. Online-only (mac/AGENTS.md): a failed
/// load shows the error and a Retry, and blocks adding and editing.
enum LoadPhase: Equatable, Sendable {
    case loading
    case loaded
    case failed(String)

    var errorMessage: String? {
        if case .failed(let message) = self { message } else { nil }
    }
}

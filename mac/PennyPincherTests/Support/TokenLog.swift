import Foundation

/// Records which tokens were asked for.
final class TokenLog: @unchecked Sendable {
    private let lock = NSLock()
    private var _refreshes: [Bool] = []
    var refreshes: [Bool] { lock.withLock { _refreshes } }

    func token(forceRefresh: Bool) -> String {
        lock.withLock { _refreshes.append(forceRefresh) }
        return forceRefresh ? "fresh-token" : "cached-token"
    }
}

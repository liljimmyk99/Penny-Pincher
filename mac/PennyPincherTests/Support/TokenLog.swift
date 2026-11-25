import Foundation

/// Counts token reads and hands out a fixed token.
final class TokenLog: @unchecked Sendable {
    private let lock = NSLock()
    private var _count = 0
    var count: Int { lock.withLock { _count } }

    func token() -> String {
        lock.withLock { _count += 1 }
        return "test-token"
    }
}

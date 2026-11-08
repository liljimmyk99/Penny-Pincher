import Foundation
@testable import PennyPincher

/// Collects session errors the middleware reports.
final class ErrorLog: @unchecked Sendable {
    private let lock = NSLock()
    private var _errors: [APIError] = []
    var errors: [APIError] { lock.withLock { _errors } }
    func record(_ error: APIError) { lock.withLock { _errors.append(error) } }
}

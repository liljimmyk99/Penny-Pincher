import Foundation
@testable import PennyPincher

/// Answers `/v1/me` with a scripted result.
final class FakeAccountAPI: AccountAPI, @unchecked Sendable {
    private let lock = NSLock()
    private var _result: Result<Account, APIError>

    init(_ result: Result<Account, APIError>) { _result = result }

    var result: Result<Account, APIError> {
        get { lock.withLock { _result } }
        set { lock.withLock { _result = newValue } }
    }

    func me() async throws(APIError) -> Account { try result.get() }
}

import Foundation
@testable import PennyPincher

extension Account {
    static let member = Account(id: "u1", email: "member@example.test", displayName: "Test Member", role: .member)
    static let admin = Account(id: "u2", email: "admin@example.test", displayName: nil, role: .admin)
}

extension AuthUser {
    static let test = AuthUser(uid: "firebase-uid", email: "member@example.test")
}

extension APIError {
    static func code(_ code: String, status: Int) -> APIError {
        APIError(code: code, status: status, message: "test")
    }
}

/// A throwaway UserDefaults suite, removed by `tearDown()` callers.
func makeTestDefaults() -> UserDefaults {
    let name = "penny-pincher-tests-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: name)!
    defaults.removePersistentDomain(forName: name)
    return defaults
}

/// A signed-in session for view model tests.
@MainActor
func makeSession(_ account: Account = .member) async -> (SessionService, FakeAuth) {
    let auth = FakeAuth()
    let session = SessionService(auth: auth, api: FakeAccountAPI(.success(account)))
    session.start()
    auth.emit(.test)
    await settle()
    return (session, auth)
}

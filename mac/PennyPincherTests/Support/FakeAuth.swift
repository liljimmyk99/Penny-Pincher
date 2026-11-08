import Foundation
@testable import PennyPincher

/// A scripted `AuthService`: tests set what each call does and fire user changes.
@MainActor
final class FakeAuth: AuthService {
    var supportsGoogle = true
    var signInResult: AuthError?
    var resetResult: AuthError?
    private(set) var calls: [String] = []
    private var onChange: (@MainActor (AuthUser?) -> Void)?

    func observeUser(_ onChange: @escaping @MainActor (AuthUser?) -> Void) {
        self.onChange = onChange
    }

    /// What Firebase would report.
    func emit(_ user: AuthUser?) { onChange?(user) }

    func signInWithGoogle() async throws(AuthError) {
        calls.append("google")
        if let signInResult { throw signInResult }
    }

    func signInWithEmail(_ email: String, password: String) async throws(AuthError) {
        calls.append("email:\(email)")
        if let signInResult { throw signInResult }
    }

    func sendPasswordReset(email: String) async throws(AuthError) {
        calls.append("reset:\(email)")
        if let resetResult { throw resetResult }
    }

    func signOut() {
        calls.append("signOut")
    }

    func idToken(forceRefresh: Bool) async throws -> String? { "token" }

    func handle(url: URL) -> Bool { false }
}

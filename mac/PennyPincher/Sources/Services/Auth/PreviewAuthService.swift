#if DEBUG
import Foundation

/// A scripted sign-in for SwiftUI previews only (never in a release build).
/// Signs in instantly, or fails with `failure`.
@MainActor
final class PreviewAuthService: AuthService {
    /// What Firebase reports when the preview starts.
    enum Start {
        /// Never reports, so the window stays on "Restoring your session…".
        case restoring
        case signedOut
        case signedIn
    }

    private let start: Start
    private let user: AuthUser
    private let failure: AuthError?
    private var onChange: (@MainActor (AuthUser?) -> Void)?
    let supportsGoogle: Bool

    init(start: Start, user: AuthUser, supportsGoogle: Bool = true, failure: AuthError? = nil) {
        self.start = start
        self.user = user
        self.supportsGoogle = supportsGoogle
        self.failure = failure
    }

    func observeUser(_ onChange: @escaping @MainActor (AuthUser?) -> Void) {
        self.onChange = onChange
        switch start {
        case .restoring: break
        case .signedOut: onChange(nil)
        case .signedIn: onChange(user)
        }
    }

    func signInWithGoogle() async throws(AuthError) {
        try signIn()
    }

    func signInWithEmail(_ email: String, password: String) async throws(AuthError) {
        try signIn()
    }

    func sendPasswordReset(email: String) async throws(AuthError) {
        if let failure { throw failure }
    }

    func signOut() {
        onChange?(nil)
    }

    func idToken(forceRefresh: Bool) async throws -> String? { "preview-token" }

    func handle(url: URL) -> Bool { false }

    private func signIn() throws(AuthError) {
        if let failure { throw failure }
        onChange?(user)
    }
}
#endif

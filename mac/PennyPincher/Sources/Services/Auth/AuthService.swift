import Foundation

/// The sign-in wrapper the app talks to. `FirebaseAuthService` is the only
/// implementation that touches the Firebase and Google SDKs; tests use a fake.
@MainActor
protocol AuthService: AnyObject {
    /// Calls `onChange` with the current user now (once Firebase has restored any
    /// saved session) and again on every sign-in and sign-out.
    func observeUser(_ onChange: @escaping @MainActor (AuthUser?) -> Void)

    /// False when no Google client id is configured (for example the emulator).
    var supportsGoogle: Bool { get }

    func signInWithGoogle() async throws(AuthError)
    func signInWithEmail(_ email: String, password: String) async throws(AuthError)
    /// Never reveals whether an account exists for `email`.
    func sendPasswordReset(email: String) async throws(AuthError)
    func signOut()

    /// The current Firebase ID token, or nil when signed out. `forceRefresh`
    /// asks for a new one after the API rejected the cached token.
    func idToken(forceRefresh: Bool) async throws -> String?

    /// Hands a redirect URL (Google sign-in) to the SDK. True when it was one.
    func handle(url: URL) -> Bool
}

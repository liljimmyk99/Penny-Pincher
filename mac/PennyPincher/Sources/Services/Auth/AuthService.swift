import Foundation

/// Signing in, changing the password and signing out against the API
/// (`APIAuthService`); tests and previews use fakes. The session token itself
/// lives in `SessionTokenStore`.
@MainActor
protocol AuthService: AnyObject {
    /// True when a token from an earlier launch is stored.
    var hasStoredSession: Bool { get }

    /// Signs in and stores the new token. Throws `invalid_credentials`,
    /// `rate_limited`, or a network error.
    func signIn(username: String, password: String) async throws(APIError) -> Account

    /// Changes the password and replaces the stored token (the old one stops working).
    /// A wrong current password is `invalid_credentials` and does not sign out.
    func changePassword(current: String, new: String) async throws(APIError) -> Account

    /// Forgets the token at once, then tells the server (best effort).
    func signOut() async

    /// Forgets the token without a network call (the server already ended the session).
    func clearToken()
}

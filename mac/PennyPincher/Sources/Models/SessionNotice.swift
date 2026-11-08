/// Why the person was signed out, shown on the sign-in screen.
enum SessionNotice: Equatable, Sendable {
    /// Signed in with Firebase, but not on the API's allowlist.
    case noAccess(email: String?)
    /// The API refused the session (revoked, or the sign-in is over 30 days old).
    case expired
}

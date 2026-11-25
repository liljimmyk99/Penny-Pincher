/// Why the person was signed out, shown on the sign-in screen.
enum SessionNotice: Equatable, Sendable {
    /// The API refused the session (revoked, or the sign-in is over 30 days old).
    case expired
}

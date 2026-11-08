/// Who Firebase says is signed in. No tokens: those stay inside the Firebase
/// SDK, which keeps them in the Keychain.
struct AuthUser: Equatable, Sendable {
    var uid: String
    var email: String?
}

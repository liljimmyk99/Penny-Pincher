import AppKit
import FirebaseAuth
import FirebaseCore
import GoogleSignIn

/// The only file that imports the Firebase and Google sign-in SDKs.
/// Everything else uses `AuthService`.
///
/// Tokens: Firebase keeps the signed-in user's refresh and ID tokens in the
/// data-protection Keychain (which is why the app is signed with a keychain
/// access group), and Google sign-in keeps its own state there too. This
/// wrapper never stores or logs a token.
@MainActor
final class FirebaseAuthService: AuthService {
    private let auth: Auth
    private let googleClientID: String?
    private var listener: AuthStateDidChangeListenerHandle?

    init(config: AppConfig.Firebase) {
        let options = FirebaseOptions(googleAppID: config.appID, gcmSenderID: config.senderID)
        options.apiKey = config.apiKey
        options.projectID = config.projectID
        options.clientID = config.googleClientID
        if FirebaseApp.app() == nil { FirebaseApp.configure(options: options) }

        auth = Auth.auth()
        // Local testing only: AppConfig allows this for demo- projects alone.
        if let emulator = config.emulator { auth.useEmulator(withHost: emulator.host, port: emulator.port) }
        // Reset emails go out in the Mac's language.
        auth.useAppLanguage()

        googleClientID = config.googleClientID
        if let googleClientID {
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: googleClientID)
        }
    }

    var supportsGoogle: Bool { googleClientID != nil }

    func observeUser(_ onChange: @escaping @MainActor (AuthUser?) -> Void) {
        if let listener { auth.removeStateDidChangeListener(listener) }
        listener = auth.addStateDidChangeListener { _, user in
            let value = user.map { AuthUser(uid: $0.uid, email: $0.email) }
            MainActor.assumeIsolated { onChange(value) }
        }
    }

    func signInWithGoogle() async throws(AuthError) {
        guard supportsGoogle else { throw AuthError(.googleUnavailable) }
        guard let window = NSApp.keyWindow ?? NSApp.windows.first(where: \.isVisible) else {
            throw AuthError(.unknown)
        }
        do {
            // Sign out of Google first so the account chooser always shows, and
            // someone refused access can pick a different account.
            GIDSignIn.sharedInstance.signOut()
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: window)
            guard let idToken = result.user.idToken?.tokenString else { throw AuthError(.unknown) }
            let credential = GoogleAuthProvider.credential(
                withIDToken: idToken,
                accessToken: result.user.accessToken.tokenString
            )
            _ = try await auth.signIn(with: credential)
        } catch {
            throw Self.map(error)
        }
    }

    func signInWithEmail(_ email: String, password: String) async throws(AuthError) {
        do {
            _ = try await auth.signIn(withEmail: email, password: password)
        } catch {
            throw Self.map(error)
        }
    }

    func sendPasswordReset(email: String) async throws(AuthError) {
        do {
            try await auth.sendPasswordReset(withEmail: email)
        } catch {
            let mapped = Self.map(error)
            // Don't reveal whether an account exists for this email.
            if mapped.code != .userNotFound { throw mapped }
        }
    }

    func signOut() {
        GIDSignIn.sharedInstance.signOut()
        // Only fails when the Keychain can't be written; the listener still
        // reports the signed-out state for this run.
        try? auth.signOut()
    }

    func idToken(forceRefresh: Bool) async throws -> String? {
        guard let user = auth.currentUser else { return nil }
        return try await user.getIDTokenResult(forcingRefresh: forceRefresh).token
    }

    func handle(url: URL) -> Bool {
        GIDSignIn.sharedInstance.handle(url)
    }

    /// Firebase and Google sign-in errors → `AuthError` (web/src/auth/errors.ts).
    static func map(_ error: any Error) -> AuthError {
        if let error = error as? AuthError { return error }
        let nsError = error as NSError
        if nsError.domain == kGIDSignInErrorDomain {
            return AuthError(nsError.code == GIDSignInError.canceled.rawValue ? .cancelled : .unknown)
        }
        if nsError.domain == NSURLErrorDomain { return AuthError(.network) }
        guard nsError.domain == AuthErrors.domain, let code = AuthErrorCode(rawValue: nsError.code) else {
            return AuthError(.unknown)
        }
        switch code {
        case .invalidCredential, .wrongPassword: return AuthError(.invalidCredentials)
        case .userNotFound: return AuthError(.userNotFound)
        case .invalidEmail, .missingEmail: return AuthError(.invalidEmail)
        case .userDisabled: return AuthError(.userDisabled)
        // Raised when sign-ups are disabled and an unknown account signs in.
        case .adminRestrictedOperation: return AuthError(.noAccess)
        case .tooManyRequests: return AuthError(.tooManyRequests)
        case .networkError, .webNetworkRequestFailed: return AuthError(.network)
        case .webContextCancelled: return AuthError(.cancelled)
        case .operationNotAllowed: return AuthError(.providerDisabled)
        case .accountExistsWithDifferentCredential: return AuthError(.accountExists)
        default: return AuthError(.unknown)
        }
    }
}

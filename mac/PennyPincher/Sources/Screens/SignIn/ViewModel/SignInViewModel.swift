import Foundation
import Observation

/// The sign-in screen (web/src/auth/SignInScreen.tsx): sign in with Google or
/// email and password, or reset a forgotten password. No sign-up.
@MainActor
@Observable
final class SignInViewModel {
    var mode: SignInMode = .signIn
    var email = ""
    var password = ""
    private(set) var busy: SignInBusy?
    private(set) var error: AuthError?

    @ObservationIgnored private let session: SessionService

    init(session: SessionService) {
        self.session = session
    }

    // MARK: State

    var supportsGoogle: Bool { session.auth.supportsGoogle }
    var isWorking: Bool { busy != nil }
    var isSigningIn: Bool { busy == .email }
    var isSendingReset: Bool { busy == .reset }

    /// The sign-out notice, until the person starts another attempt.
    var notice: SessionNotice? {
        if case .signedOut(let notice) = session.phase { notice } else { nil }
    }

    var noticeMessage: String? {
        switch notice {
        case .noAccess(let email):
            let who = email ?? String(localized: "signIn.notice.thisAccount")
            return String(localized: "signIn.notice.noAccess \(who)")
        case .expired:
            return String(localized: "signIn.notice.expired")
        case nil:
            return nil
        }
    }

    var errorMessage: String? {
        guard let error, !error.message.isEmpty else { return nil }
        return error.message
    }

    var isPasswordInvalid: Bool { error?.isCredentialError ?? false }
    var isEmailInvalid: Bool { error?.code == .invalidEmail }

    var canSubmit: Bool {
        busy == nil && !trimmedEmail.isEmpty && (mode != .signIn || !password.isEmpty)
    }

    var googleButtonTitle: LocalizedStringResource {
        busy == .google ? "signIn.google.opening" : "signIn.google"
    }

    var signInButtonTitle: LocalizedStringResource {
        isSigningIn ? "signIn.submit.busy" : "signIn.submit"
    }

    var resetButtonTitle: LocalizedStringResource {
        isSendingReset ? "signIn.reset.submit.busy" : "signIn.reset.submit"
    }

    /// Where focus goes when the screen (or a mode) appears.
    var initialFocus: SignInField? { mode == .sent ? nil : .email }

    /// Where Return in the email field goes: the password on sign-in, otherwise submit.
    var fieldAfterEmail: SignInField? { mode == .signIn ? .password : nil }

    // MARK: Actions

    func go(_ mode: SignInMode) {
        error = nil
        self.mode = mode
    }

    func signInWithGoogle() async {
        let auth = session.auth
        await attempt(.google) { () throws(AuthError) in try await auth.signInWithGoogle() }
    }

    func signInWithEmail() async {
        guard canSubmit else { return }
        let auth = session.auth, email = trimmedEmail, password = password
        await attempt(.email) { () throws(AuthError) in try await auth.signInWithEmail(email, password: password) }
    }

    func sendReset() async {
        guard canSubmit else { return }
        let auth = session.auth, email = trimmedEmail
        if await attempt(.reset, { () throws(AuthError) in try await auth.sendPasswordReset(email: email) }) {
            go(.sent)
        }
    }

    // MARK: Private

    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }

    @discardableResult
    private func attempt(_ kind: SignInBusy, _ run: @MainActor () async throws(AuthError) -> Void) async -> Bool {
        guard busy == nil else { return false }
        busy = kind
        error = nil
        session.clearNotice()
        defer { busy = nil }
        do throws(AuthError) {
            try await run()
            if kind != .reset { password = "" }
            return true
        } catch {
            self.error = error
            return false
        }
    }
}

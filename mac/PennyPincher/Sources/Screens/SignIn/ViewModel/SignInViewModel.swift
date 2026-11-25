import Foundation
import Observation

/// The sign-in screen (web/src/auth/SignInScreen.tsx): username and password.
/// No sign-up and no reset: an admin creates accounts and resets passwords.
@MainActor
@Observable
final class SignInViewModel {
    var username = ""
    var password = ""
    private(set) var isSigningIn = false
    private(set) var error: APIError?

    @ObservationIgnored private let session: SessionService

    init(session: SessionService) {
        self.session = session
    }

    /// The sign-out notice, until the person starts another attempt.
    var noticeMessage: String? {
        if case .signedOut(.expired) = session.phase { String(localized: "signIn.notice.expired") } else { nil }
    }

    var errorMessage: String? { error?.userMessage }
    var isPasswordInvalid: Bool { error?.code == "invalid_credentials" }
    var canSubmit: Bool { !isSigningIn && !trimmedUsername.isEmpty && !password.isEmpty }

    var signInButtonTitle: LocalizedStringResource {
        isSigningIn ? "signIn.submit.busy" : "signIn.submit"
    }

    /// Where Return in the username field goes.
    var fieldAfterUsername: SignInField { .password }

    func signIn() async {
        guard canSubmit else { return }
        let name = trimmedUsername, secret = password
        isSigningIn = true
        error = nil
        defer { isSigningIn = false }
        do throws(APIError) {
            try await session.signIn(username: name, password: secret)
            password = ""
        } catch {
            self.error = error
        }
    }

    private var trimmedUsername: String { username.trimmingCharacters(in: .whitespacesAndNewlines) }
}

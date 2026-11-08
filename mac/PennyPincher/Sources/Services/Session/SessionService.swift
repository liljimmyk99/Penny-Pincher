import Foundation
import Observation

/// The app-wide auth state every screen reads (web/src/auth/session.ts, plus
/// the `/v1/me` load the web app does in its shell).
@MainActor
@Observable
final class SessionService {
    enum Phase: Equatable {
        /// Waiting for Firebase to restore a saved session.
        case restoring
        case signedOut(SessionNotice?)
        /// Firebase has a user; loading their account from the API.
        case loadingAccount(AuthUser)
        case signedIn(Account)
        /// Firebase has a user but the API couldn't be reached. Retry or sign out.
        case accountUnavailable(AuthUser, message: String)
    }

    private(set) var phase: Phase = .restoring
    let auth: AuthService
    private let api: AccountAPI
    /// Bumped on every Firebase user change, so a stale `/v1/me` answer is dropped.
    private var generation = 0

    init(auth: AuthService, api: AccountAPI) {
        self.auth = auth
        self.api = api
    }

    /// Starts listening to Firebase. Call once.
    func start() {
        auth.observeUser { [weak self] user in self?.userChanged(user) }
    }

    var account: Account? {
        if case .signedIn(let account) = phase { account } else { nil }
    }

    func signOut() {
        phase = .signedOut(nil)
        auth.signOut()
    }

    /// The API refused this session: sign out and say why. Several requests can
    /// fail at once; the first one decides the notice.
    func end(_ error: APIError) {
        let email: String?
        switch phase {
        case .signedIn(let account): email = account.email
        case .loadingAccount(let user), .accountUnavailable(let user, _): email = user.email
        case .restoring, .signedOut: return
        }
        phase = .signedOut(error.code == "not_allowlisted" ? .noAccess(email: email) : .expired)
        auth.signOut()
    }

    /// Drops the sign-out notice when the person starts another attempt.
    func clearNotice() {
        if case .signedOut(.some) = phase { phase = .signedOut(nil) }
    }

    func retryAccount() {
        if case .accountUnavailable(let user, _) = phase { load(user) }
    }

    /// Hands a redirect URL (Google sign-in) to the auth SDK.
    @discardableResult
    func handle(url: URL) -> Bool { auth.handle(url: url) }

    private func userChanged(_ user: AuthUser?) {
        generation += 1
        guard let user else {
            // Keep a notice set by end(): Firebase reports the sign-out after it.
            if case .signedOut = phase { return }
            phase = .signedOut(nil)
            return
        }
        load(user)
    }

    private func load(_ user: AuthUser) {
        let current = generation
        phase = .loadingAccount(user)
        Task {
            do throws(APIError) {
                let account = try await api.me()
                guard current == generation, case .loadingAccount = phase else { return }
                phase = .signedIn(account)
            } catch {
                // Session errors may already have gone through end() (from the middleware).
                guard current == generation, case .loadingAccount = phase else { return }
                if error.isSessionError {
                    end(error)
                } else {
                    phase = .accountUnavailable(user, message: error.message)
                }
            }
        }
    }
}

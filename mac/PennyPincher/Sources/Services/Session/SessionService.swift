import Foundation
import Observation

/// The app-wide auth state every screen reads (web/src/auth/session.ts, plus
/// the `/v1/me` load the web app does in its shell).
@MainActor
@Observable
final class SessionService {
    enum Phase: Equatable {
        /// Before `start()` has looked for a stored token.
        case restoring
        case signedOut(SessionNotice?)
        /// A token is stored; asking the API who it belongs to.
        case loadingAccount
        /// An admin set or reset the password: only Change password is allowed.
        case passwordChangeRequired
        case signedIn(Account)
        /// A token is stored but the API couldn't be reached. Retry or sign out.
        case accountUnavailable(message: String)
    }

    private(set) var phase: Phase = .restoring
    let auth: AuthService
    private let api: AccountAPI
    /// Bumped on every phase change that matters, so a stale `/v1/me` answer is dropped.
    private var generation = 0

    init(auth: AuthService, api: AccountAPI) {
        self.auth = auth
        self.api = api
    }

    /// Looks for a token from an earlier launch. Call once.
    func start() {
        guard case .restoring = phase else { return }
        if auth.hasStoredSession {
            load()
        } else {
            phase = .signedOut(nil)
        }
    }

    var account: Account? {
        if case .signedIn(let account) = phase { account } else { nil }
    }

    /// Signs in; the phase follows. Throws the API's error for the form to show.
    func signIn(username: String, password: String) async throws(APIError) {
        clearNotice()
        let account = try await auth.signIn(username: username, password: password)
        accept(account)
    }

    /// Changes the password (forced or from the account menu). The stored token
    /// is replaced; the phase becomes signed in.
    func changePassword(current: String, new: String) async throws(APIError) {
        let account = try await auth.changePassword(current: current, new: new)
        accept(account)
    }

    func signOut() {
        generation += 1
        phase = .signedOut(nil)
        let auth = auth
        Task { await auth.signOut() }
    }

    /// The API refused this session. Several requests can fail at once; the
    /// first one decides.
    func end(_ error: APIError) {
        switch phase {
        case .restoring, .signedOut: return
        case .loadingAccount, .passwordChangeRequired, .signedIn, .accountUnavailable: break
        }
        generation += 1
        if error.isPasswordChangeRequired {
            phase = .passwordChangeRequired
        } else if error.isSessionError {
            phase = .signedOut(.expired)
            auth.clearToken()
        }
    }

    /// Drops the sign-out notice when the person starts another attempt.
    func clearNotice() {
        if case .signedOut(.some) = phase { phase = .signedOut(nil) }
    }

    func retryAccount() {
        if case .accountUnavailable = phase { load() }
    }

    private func accept(_ account: Account) {
        generation += 1
        phase = account.mustChangePassword ? .passwordChangeRequired : .signedIn(account)
    }

    private func load() {
        generation += 1
        let current = generation
        phase = .loadingAccount
        Task {
            do throws(APIError) {
                let account = try await api.me()
                guard current == generation, case .loadingAccount = phase else { return }
                accept(account)
            } catch {
                // Session errors may already have gone through end() (from the middleware).
                guard current == generation, case .loadingAccount = phase else { return }
                if error.isSessionError || error.isPasswordChangeRequired {
                    end(error)
                } else {
                    phase = .accountUnavailable(message: error.message)
                }
            }
        }
    }
}

#if DEBUG
import Foundation

/// A scripted sign-in for SwiftUI previews only (never in a release build).
/// Signs in instantly, or fails with `failure`.
@MainActor
final class PreviewAuthService: AuthService {
    let hasStoredSession: Bool
    private let account: Account
    private let failure: APIError?

    init(hasStoredSession: Bool, account: Account, failure: APIError? = nil) {
        self.hasStoredSession = hasStoredSession
        self.account = account
        self.failure = failure
    }

    func signIn(username: String, password: String) async throws(APIError) -> Account {
        if let failure { throw failure }
        return account
    }

    func changePassword(current: String, new: String) async throws(APIError) -> Account {
        if let failure { throw failure }
        var changed = account
        changed.mustChangePassword = false
        return changed
    }

    func signOut() async {}
    func clearToken() {}
}
#endif

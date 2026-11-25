import Foundation
@testable import PennyPincher

/// A scripted `AuthService`: tests set what each call returns and read what was called.
@MainActor
final class FakeAuth: AuthService {
    var hasStoredSession = false
    var signInResult: Result<Account, APIError> = .success(.member)
    var changeResult: Result<Account, APIError> = .success(.member)
    private(set) var calls: [String] = []

    func signIn(username: String, password: String) async throws(APIError) -> Account {
        calls.append("signIn:\(username)")
        return try signInResult.get()
    }

    func changePassword(current: String, new: String) async throws(APIError) -> Account {
        calls.append("change:\(current)>\(new)")
        return try changeResult.get()
    }

    func signOut() async {
        calls.append("signOut")
    }

    func clearToken() {
        calls.append("clearToken")
    }
}

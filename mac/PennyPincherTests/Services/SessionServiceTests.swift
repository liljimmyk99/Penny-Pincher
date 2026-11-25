import Testing
@testable import PennyPincher

@MainActor
@Suite("Session service")
struct SessionServiceTests {
    let auth = FakeAuth()
    let api = FakeAccountAPI(.success(.member))
    let session: SessionService

    init() {
        session = SessionService(auth: auth, api: api)
    }

    @Test("Starts signed out when no token is stored")
    func noToken() {
        #expect(session.phase == .restoring)
        session.start()
        #expect(session.phase == .signedOut(nil))
    }

    @Test("A stored token loads the account")
    func restores() async {
        auth.hasStoredSession = true
        session.start()
        #expect(session.phase == .loadingAccount)
        await settle()
        #expect(session.phase == .signedIn(.member))
        #expect(session.account == .member)
    }

    @Test("A stored token that must be changed goes to Change password")
    func restoresMustChange() async {
        var account = Account.member
        account.mustChangePassword = true
        api.result = .success(account)
        auth.hasStoredSession = true
        session.start()
        await settle()
        #expect(session.phase == .passwordChangeRequired)
    }

    @Test("A refused stored token signs out with a notice and forgets it")
    func refusedToken() async {
        api.result = .failure(.code("unauthenticated", status: 401))
        auth.hasStoredSession = true
        session.start()
        await settle()
        #expect(session.phase == .signedOut(.expired))
        #expect(auth.calls == ["clearToken"])
    }

    @Test("Signing in signs the person in")
    func signIn() async throws {
        session.start()
        try await session.signIn(username: "member", password: "test-password")
        #expect(session.phase == .signedIn(.member))
        #expect(auth.calls == ["signIn:member"])
    }

    @Test("A sign-in that must change the password goes to Change password")
    func signInMustChange() async throws {
        var account = Account.member
        account.mustChangePassword = true
        auth.signInResult = .success(account)
        session.start()
        try await session.signIn(username: "member", password: "temporary-password")
        #expect(session.phase == .passwordChangeRequired)
        #expect(session.account == nil)
    }

    @Test("A failed sign-in throws and stays signed out")
    func signInFails() async {
        auth.signInResult = .failure(.code("invalid_credentials", status: 401))
        session.start()
        await #expect(throws: APIError.self) {
            try await session.signIn(username: "member", password: "wrong")
        }
        #expect(session.phase == .signedOut(nil))
    }

    @Test("Changing the password signs in")
    func changePassword() async throws {
        var account = Account.member
        account.mustChangePassword = true
        auth.signInResult = .success(account)
        session.start()
        try await session.signIn(username: "member", password: "temporary-password")
        try await session.changePassword(current: "temporary-password", new: "a-new-password-1")
        #expect(session.phase == .signedIn(.member))
        #expect(auth.calls.last == "change:temporary-password>a-new-password-1")
    }

    @Test("password_change_required keeps the token and shows Change password")
    func passwordChangeRequired() async {
        auth.hasStoredSession = true
        session.start()
        await settle()
        session.end(.code("password_change_required", status: 403))
        #expect(session.phase == .passwordChangeRequired)
        #expect(!auth.calls.contains("clearToken"))
    }

    @Test("An expired session signs out with a notice; only the first failure counts")
    func expired() async {
        auth.hasStoredSession = true
        session.start()
        await settle()
        session.end(.code("session_expired", status: 401))
        #expect(session.phase == .signedOut(.expired))
        session.end(.code("unauthenticated", status: 401))
        #expect(auth.calls == ["clearToken"])
    }

    @Test("An unreachable server offers retry")
    func unreachable() async {
        api.result = .failure(.network())
        auth.hasStoredSession = true
        session.start()
        await settle()
        #expect(session.phase == .accountUnavailable(message: APIError.network().message))

        api.result = .success(.admin)
        session.retryAccount()
        await settle()
        #expect(session.phase == .signedIn(.admin))
    }

    @Test("Sign out clears the account and revokes the session")
    func signOut() async {
        auth.hasStoredSession = true
        session.start()
        await settle()
        session.signOut()
        #expect(session.phase == .signedOut(nil))
        #expect(session.account == nil)
        await settle()
        #expect(auth.calls == ["signOut"])
    }

    @Test("clearNotice drops only the notice")
    func clearNotice() async {
        auth.hasStoredSession = true
        session.start()
        await settle()
        session.end(.code("session_expired", status: 401))
        session.clearNotice()
        #expect(session.phase == .signedOut(nil))
    }
}

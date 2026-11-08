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
        session.start()
    }

    @Test("Restores until Firebase reports")
    func restoring() {
        #expect(session.phase == .restoring)
        auth.emit(nil)
        #expect(session.phase == .signedOut(nil))
    }

    @Test("Loads the account after sign-in")
    func loadsAccount() async {
        auth.emit(.test)
        #expect(session.phase == .loadingAccount(.test))
        await settle()
        #expect(session.phase == .signedIn(.member))
        #expect(session.account == .member)
    }

    @Test("not_allowlisted signs out with a notice")
    func notAllowlisted() async {
        api.result = .failure(.code("not_allowlisted", status: 403))
        auth.emit(.test)
        await settle()
        #expect(session.phase == .signedOut(.noAccess(email: "member@example.test")))
        #expect(auth.calls == ["signOut"])
        // Firebase reports the sign-out afterwards; the notice stays.
        auth.emit(nil)
        #expect(session.phase == .signedOut(.noAccess(email: "member@example.test")))
    }

    @Test("An expired session signs out with a notice; only the first failure counts")
    func expired() async {
        auth.emit(.test)
        await settle()
        session.end(.code("session_expired", status: 401))
        #expect(session.phase == .signedOut(.expired))
        session.end(.code("not_allowlisted", status: 403))
        #expect(session.phase == .signedOut(.expired))
        #expect(auth.calls == ["signOut"])
    }

    @Test("An unreachable server offers retry")
    func unreachable() async {
        api.result = .failure(.network())
        auth.emit(.test)
        await settle()
        #expect(session.phase == .accountUnavailable(.test, message: APIError.network().message))

        api.result = .success(.admin)
        session.retryAccount()
        await settle()
        #expect(session.phase == .signedIn(.admin))
    }

    @Test("Sign out clears the account")
    func signOut() async {
        auth.emit(.test)
        await settle()
        session.signOut()
        #expect(session.phase == .signedOut(nil))
        #expect(session.account == nil)
        #expect(auth.calls == ["signOut"])
    }

    @Test("Ignores an account answer for an earlier user")
    func staleAnswer() async {
        auth.emit(.test)
        auth.emit(nil)
        await settle()
        #expect(session.phase == .signedOut(nil))
    }

    @Test("clearNotice drops only the notice")
    func clearNotice() async {
        auth.emit(.test)
        await settle()
        session.end(.code("session_expired", status: 401))
        session.clearNotice()
        #expect(session.phase == .signedOut(nil))
    }
}

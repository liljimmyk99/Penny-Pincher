import Foundation
import Testing
@testable import PennyPincher

@MainActor
@Suite("Root view model")
struct RootViewModelTests {
    let auth = FakeAuth()
    let api = FakeAccountAPI(.success(.member))
    let session: SessionService
    let main: MainViewModel
    let root: RootViewModel

    init() {
        session = SessionService(auth: auth, api: api)
        auth.hasStoredSession = true
        main = MainViewModel(session: session, api: FakeLedgerAPI(), adminURL: URL(string: "https://spend.example.test/admin")!,
                             defaults: makeTestDefaults(), openURL: { _ in })
        root = RootViewModel(setup: .ready(session: session, main: main),
                             appearance: AppearanceService(defaults: makeTestDefaults()))
    }

    @Test("Shows the setup problem")
    func setupProblem() throws {
        let root = RootViewModel(setup: .misconfigured(.missing("PP_SERVER_URL")),
                                 appearance: AppearanceService(defaults: makeTestDefaults()))
        guard case .setupProblem(let message) = root.content else { throw Unexpected(root.content) }
        #expect(message == "PP_SERVER_URL is not set. Add it to mac/Config/Local.xcconfig and build again.")
    }

    @Test("Follows the session phases")
    func phases() async throws {
        guard case .restoring = root.content else { throw Unexpected(root.content) }

        session.start()
        guard case .loadingAccount = root.content else { throw Unexpected(root.content) }

        await settle()
        guard case .signedIn(let shown) = root.content else { throw Unexpected(root.content) }
        #expect(shown === main)
    }

    @Test("Shows Change password when an admin set the password")
    func changePassword() async throws {
        var account = Account.member
        account.mustChangePassword = true
        api.result = .success(account)
        session.start()
        await settle()
        guard case .changePassword(let first) = root.content, case .changePassword(let again) = root.content else {
            throw Unexpected(root.content)
        }
        #expect(first === again)
        #expect(first.mode == .forced)
    }

    @Test("Keeps one sign-in form while signed out; a later sign-out starts fresh")
    func oneSignInForm() async throws {
        auth.hasStoredSession = false
        session.start()
        guard case .signedOut(let first) = root.content, case .signedOut(let again) = root.content else {
            throw Unexpected(root.content)
        }
        #expect(first === again)

        first.username = "typed"
        try await session.signIn(username: "typed", password: "test-password")
        _ = root.content
        root.signOut()
        guard case .signedOut(let next) = root.content else { throw Unexpected(root.content) }
        #expect(next !== first)
        #expect(next.username.isEmpty)
    }

    @Test("Retries when the server was unreachable")
    func retry() async throws {
        api.result = .failure(.network())
        session.start()
        await settle()
        guard case .accountUnavailable(let message) = root.content else { throw Unexpected(root.content) }
        #expect(message == "Can't reach the server. Check your connection and try again.")

        api.result = .success(.member)
        root.retryAccount()
        await settle()
        guard case .signedIn = root.content else { throw Unexpected(root.content) }
    }
}

private struct Unexpected: Error, CustomStringConvertible {
    let description: String
    @MainActor init(_ content: RootContent) { description = "unexpected content: \(content)" }
}

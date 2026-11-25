import Foundation
import Testing
@testable import PennyPincher

/// Signs in for real against a running API (a local one). Disabled unless these
/// are set (xcodebuild passes `TEST_RUNNER_`-prefixed variables without the prefix):
///
///     TEST_RUNNER_PP_SERVER_URL=http://localhost:8080
///     TEST_RUNNER_PP_TEST_USERNAME=…  TEST_RUNNER_PP_TEST_PASSWORD=…
///
/// The account must exist on that API (`api user add`) and must not be asked to
/// change its password. See mac/AGENTS.md, "Running it".
struct IntegrationSettings {
    var server: URL
    var username: String
    var password: String

    static var current: IntegrationSettings? {
        let env = ProcessInfo.processInfo.environment
        guard let server = env["PP_SERVER_URL"].flatMap(URL.init(string:)),
              let username = env["PP_TEST_USERNAME"], let password = env["PP_TEST_PASSWORD"] else { return nil }
        return IntegrationSettings(server: server, username: username, password: password)
    }
}

@MainActor
@Suite("Sign-in integration",
       .enabled(if: IntegrationSettings.current != nil, "Set PP_SERVER_URL, PP_TEST_USERNAME and PP_TEST_PASSWORD to run."))
struct SignInIntegrationTests {
    @Test("Signs in, loads the account, and signs out")
    func signsIn() async throws {
        let settings = try #require(IntegrationSettings.current)
        let store = SessionTokenStore(backing: MemoryTokenBacking())
        let auth = APIAuthService(serverURL: settings.server, store: store)
        let errors = ErrorLog()
        let api = APIClient(serverURL: settings.server, token: { store.token },
                            onSessionError: { errors.record($0) })

        // A wrong password is refused and nothing is stored.
        let wrong = await #expect(throws: APIError.self) {
            try await auth.signIn(username: settings.username, password: settings.password + "-wrong")
        }
        #expect(wrong?.code == "invalid_credentials")
        #expect(store.token == nil)

        // The right one signs in, and the stored token works on /v1/me.
        let account = try await auth.signIn(username: settings.username, password: settings.password)
        #expect(account.username.lowercased() == settings.username.lowercased())
        #expect(store.token != nil)
        let me = try await api.me()
        #expect(me.id == account.id)

        // Signing out forgets the token and revokes it on the server.
        let old = store.token
        await auth.signOut()
        #expect(store.token == nil)
        let revoked = APIClient(serverURL: settings.server, token: { old }, onSessionError: { errors.record($0) })
        await #expect(throws: APIError.self) { try await revoked.me() }
        #expect(errors.errors.map(\.code) == ["unauthenticated"])
    }
}

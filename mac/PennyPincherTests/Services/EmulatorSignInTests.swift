import Foundation
import Testing
@testable import PennyPincher

/// Signs in for real: Firebase Auth emulator, the Keychain, an ID token and
/// `/v1/me` on a running API. Disabled unless these are set (xcodebuild passes
/// `TEST_RUNNER_`-prefixed variables to tests without the prefix):
///
///     TEST_RUNNER_PP_EMULATOR_HOST=localhost:19099
///     TEST_RUNNER_PP_SERVER_URL=http://localhost:8080
///     TEST_RUNNER_PP_TEST_EMAIL=…  TEST_RUNNER_PP_TEST_PASSWORD=…
///
/// The account must exist in the emulator and be allowlisted on that API
/// (`api user add`). See mac/AGENTS.md, "Running it".
/// The emulator settings from the environment, or nil to skip.
struct EmulatorSettings {
    var host: String
    var server: String
    var email: String
    var password: String

    static var current: EmulatorSettings? {
        let env = ProcessInfo.processInfo.environment
        guard let host = env["PP_EMULATOR_HOST"], let server = env["PP_SERVER_URL"],
              let email = env["PP_TEST_EMAIL"], let password = env["PP_TEST_PASSWORD"] else { return nil }
        return EmulatorSettings(host: host, server: server, email: email, password: password)
    }
}

@MainActor
@Suite("Emulator sign-in", .enabled(if: EmulatorSettings.current != nil, "Set PP_EMULATOR_HOST, PP_SERVER_URL, PP_TEST_EMAIL and PP_TEST_PASSWORD to run."))
struct EmulatorSignInTests {
    @Test("Signs in and loads the account")
    func signsIn() async throws {
        let settings = try #require(EmulatorSettings.current)
        let config = try AppConfig.load(from: [
            "PPServerURL": settings.server,
            "PPFirebaseAPIKey": "demo-api-key",
            "PPFirebaseProjectID": "demo-penny-pincher",
            "PPFirebaseAppID": "1:000000000000:ios:0000000000000000",
            "PPFirebaseSenderID": "000000000000",
            "PPFirebaseAuthEmulatorHost": settings.host,
        ]).get()

        let auth = FirebaseAuthService(config: config.firebase)
        let sessionErrors = ErrorLog()
        let api = APIClient(
            serverURL: config.serverURL,
            token: { forceRefresh in try await auth.idToken(forceRefresh: forceRefresh) },
            onSessionError: { sessionErrors.record($0) }
        )
        let session = SessionService(auth: auth, api: api)
        session.start()
        auth.signOut()

        // A wrong password is refused with the credentials message.
        let wrong = await #expect(throws: AuthError.self) {
            try await auth.signInWithEmail(settings.email, password: settings.password + "-wrong")
        }
        #expect(wrong?.isCredentialError == true)

        try await auth.signInWithEmail(settings.email, password: settings.password)
        let account = try await waitForAccount(session)
        #expect(account.email == settings.email)
        #expect(sessionErrors.errors.isEmpty)

        // A forced refresh still works (the token comes back from the Keychain-backed user).
        #expect(try await auth.idToken(forceRefresh: true) != nil)

        session.signOut()
        #expect(session.phase == .signedOut(nil))
        #expect(try await auth.idToken(forceRefresh: false) == nil)
    }

    private func waitForAccount(_ session: SessionService) async throws -> Account {
        for _ in 0..<100 {
            switch session.phase {
            case .signedIn(let account): return account
            case .accountUnavailable(_, let message): throw Failure("API unreachable: \(message)")
            // Plain signed-out is Firebase not having reported the sign-in yet.
            case .signedOut(.some(let notice)): throw Failure("signed out: \(notice)")
            default: break
            }
            try await Task.sleep(for: .milliseconds(100))
        }
        throw Failure("timed out waiting for /v1/me")
    }
}

private struct Failure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

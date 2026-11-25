import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

/// The three auth calls, off the main actor.
private struct AuthCalls: Sendable {
    let client: Client

    func login(username: String, password: String) async throws(APIError) -> Components.Schemas.LoginResult {
        try await APIClient.perform {
            try await client.login(body: .json(.init(username: username, password: password))).ok.body.json
        }
    }

    func changePassword(current: String, new: String) async throws(APIError) -> Components.Schemas.LoginResult {
        try await APIClient.perform {
            try await client.changePassword(body: .json(.init(currentPassword: current, newPassword: new))).ok.body.json
        }
    }

    func logout() async {
        _ = try? await APIClient.perform { _ = try await client.logout().noContent }
    }
}

/// Sign-in, password change and sign-out through the generated client
/// (web/src/auth/api.ts). It has its own client with no session reporting:
/// a wrong password (`401 invalid_credentials`) must not sign anyone out.
@MainActor
final class APIAuthService: AuthService {
    private let serverURL: URL
    private let transport: any ClientTransport
    private let calls: AuthCalls
    private let store: SessionTokenStore

    init(serverURL: URL, store: SessionTokenStore, transport: any ClientTransport = URLSessionTransport()) {
        self.serverURL = serverURL
        self.transport = transport
        self.store = store
        calls = AuthCalls(client: Self.makeClient(serverURL: serverURL, transport: transport) { [store] in store.token })
    }

    private static func makeClient(
        serverURL: URL, transport: any ClientTransport, token: @escaping AuthMiddleware.TokenProvider
    ) -> Client {
        Client(
            serverURL: serverURL,
            configuration: Configuration(dateTranscoder: FlexibleDateTranscoder()),
            transport: transport,
            middlewares: [ErrorMiddleware(), AuthMiddleware(token: token, onSessionError: { _ in })]
        )
    }

    var hasStoredSession: Bool { store.token != nil }

    func signIn(username: String, password: String) async throws(APIError) -> Account {
        accept(try await calls.login(username: username, password: password))
    }

    func changePassword(current: String, new: String) async throws(APIError) -> Account {
        accept(try await calls.changePassword(current: current, new: new))
    }

    func signOut() async {
        // Forget the token first, so quitting mid-request can't leave it behind;
        // the revoke call carries the old one.
        guard let old = store.token else { return }
        store.clear()
        await AuthCalls(client: Self.makeClient(serverURL: serverURL, transport: transport) { old }).logout()
    }

    func clearToken() {
        store.clear()
    }

    private func accept(_ result: Components.Schemas.LoginResult) -> Account {
        store.save(result.token)
        var account = Account(result.user)
        account.mustChangePassword = result.mustChangePassword
        return account
    }
}

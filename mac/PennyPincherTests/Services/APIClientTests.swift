import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import PennyPincher

@Suite("API client and auth middleware")
struct APIClientTests {
    private let server = URL(string: "https://spend.example.test")!

    private func client(_ replies: [ScriptedTransport.Reply], tokens: TokenLog = TokenLog(), errors: ErrorLog = ErrorLog())
        -> (APIClient, ScriptedTransport) {
        let transport = ScriptedTransport(replies)
        let client = APIClient(
            serverURL: server,
            token: { tokens.token() },
            onSessionError: { errors.record($0) },
            transport: transport
        )
        return (client, transport)
    }

    private func code(of call: () async throws(APIError) -> Account) async -> String? {
        do {
            _ = try await call()
            return nil
        } catch {
            return error.code
        }
    }

    @Test("/v1/me sends the bearer token and decodes the account")
    func me() async throws {
        let (client, transport) = client([
            .init(status: 200, json: #"{"id":"u1","username":"admin","email":"admin@example.test","display_name":null,"role":"admin","must_change_password":false}"#),
        ])
        let account = try await client.me()
        #expect(account == Account(id: "u1", username: "admin", email: "admin@example.test", displayName: nil, role: .admin))
        #expect(transport.requests.first?.path == "/v1/me")
        #expect(transport.requests.first?.headerFields[.authorization] == "Bearer test-token")
    }

    @Test("A 401 is reported once, with no retry")
    func noRetry() async {
        let tokens = TokenLog(), errors = ErrorLog()
        let (client, transport) = client([.init(status: 401, json: errorJSON("unauthenticated"))],
                                         tokens: tokens, errors: errors)
        #expect(await code(of: client.me) == "unauthenticated")
        #expect(tokens.count == 1)
        #expect(transport.requests.count == 1)
        #expect(errors.errors.map(\.code) == ["unauthenticated"])
    }

    @Test("Reports an expired session")
    func expired() async {
        let errors = ErrorLog()
        let (client, _) = client([.init(status: 401, json: errorJSON("session_expired"))], errors: errors)
        #expect(await code(of: client.me) == "session_expired")
        #expect(errors.errors.map(\.code) == ["session_expired"])
    }

    @Test("Reports password_change_required but not admin_required")
    func forbidden() async {
        let errors = ErrorLog()
        let (change, _) = client([.init(status: 403, json: errorJSON("password_change_required"))], errors: errors)
        #expect(await code(of: change.me) == "password_change_required")
        #expect(errors.errors.map(\.code) == ["password_change_required"])

        let adminErrors = ErrorLog()
        let (admin, _) = client([.init(status: 403, json: errorJSON("admin_required"))], errors: adminErrors)
        #expect(await code(of: admin.me) == "admin_required")
        #expect(adminErrors.errors.isEmpty)
    }

    @Test("Server and network failures")
    func failures() async {
        // The scripted transport answers 500 with no body once the script runs out.
        let (client, _) = client([])
        #expect(await code(of: client.me) == "internal")

        let failing = APIClient(serverURL: server, token: { nil }, onSessionError: { _ in },
                                transport: FailingTransport())
        #expect(await code(of: failing.me) == APIError.networkCode)
    }
}

private struct FailingTransport: ClientTransport {
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        throw URLError(.notConnectedToInternet)
    }
}

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
            token: { tokens.token(forceRefresh: $0) },
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
            .init(status: 200, json: #"{"id":"u1","email":"admin@example.test","display_name":null,"role":"admin"}"#),
        ])
        let account = try await client.me()
        #expect(account == Account(id: "u1", email: "admin@example.test", displayName: nil, role: .admin))
        #expect(transport.requests.first?.path == "/v1/me")
        #expect(transport.requests.first?.headerFields[.authorization] == "Bearer cached-token")
    }

    @Test("Retries a 401 once with a fresh token")
    func retries() async throws {
        let tokens = TokenLog(), errors = ErrorLog()
        let (client, transport) = client([
            .init(status: 401, json: errorJSON("unauthenticated")),
            .init(status: 200, json: #"{"id":"u1","role":"member"}"#),
        ], tokens: tokens, errors: errors)
        _ = try await client.me()
        #expect(tokens.refreshes == [false, true])
        #expect(transport.requests.map { $0.headerFields[.authorization] } == ["Bearer cached-token", "Bearer fresh-token"])
        #expect(errors.errors.isEmpty)
    }

    @Test("Reports a 401 that survives the refresh")
    func reportsLasting401() async {
        let errors = ErrorLog()
        let (client, _) = client([
            .init(status: 401, json: errorJSON("unauthenticated")),
            .init(status: 401, json: errorJSON("unauthenticated")),
        ], errors: errors)
        #expect(await code(of: client.me) == "unauthenticated")
        #expect(errors.errors.map(\.code) == ["unauthenticated"])
    }

    @Test("Doesn't retry an expired session")
    func expired() async {
        let tokens = TokenLog(), errors = ErrorLog()
        let (client, transport) = client([.init(status: 401, json: errorJSON("session_expired"))],
                                         tokens: tokens, errors: errors)
        #expect(await code(of: client.me) == "session_expired")
        #expect(tokens.refreshes == [false])
        #expect(transport.requests.count == 1)
        #expect(errors.errors.map(\.code) == ["session_expired"])
    }

    @Test("Reports not_allowlisted but not admin_required")
    func forbidden() async {
        let errors = ErrorLog()
        let (allowlist, _) = client([.init(status: 403, json: errorJSON("not_allowlisted"))], errors: errors)
        #expect(await code(of: allowlist.me) == "not_allowlisted")
        #expect(errors.errors.map(\.code) == ["not_allowlisted"])

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

        let failing = APIClient(serverURL: server, token: { _ in nil }, onSessionError: { _ in },
                                transport: FailingTransport())
        #expect(await code(of: failing.me) == APIError.networkCode)
    }
}

private struct FailingTransport: ClientTransport {
    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        throw URLError(.notConnectedToInternet)
    }
}

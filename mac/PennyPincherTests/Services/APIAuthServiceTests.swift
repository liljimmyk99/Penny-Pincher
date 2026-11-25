import Foundation
import HTTPTypes
import Testing
@testable import PennyPincher

@MainActor
@Suite("API auth service")
struct APIAuthServiceTests {
    private let server = URL(string: "https://spend.example.test")!
    private let result = #"{"token":"new-token","expires_at":"2026-12-24T10:00:00Z","must_change_password":false,"user":{"id":"u1","username":"member","email":null,"display_name":null,"role":"member","must_change_password":false}}"#

    private func service(_ replies: [ScriptedTransport.Reply], token: String? = nil)
        -> (APIAuthService, ScriptedTransport, SessionTokenStore) {
        let transport = ScriptedTransport(replies)
        let store = SessionTokenStore(backing: MemoryTokenBacking(token))
        return (APIAuthService(serverURL: server, store: store, transport: transport), transport, store)
    }

    @Test("Signing in stores the token and sends no bearer")
    func signIn() async throws {
        let (service, transport, store) = service([.init(status: 200, json: result)], token: "stale")
        let account = try await service.signIn(username: "member", password: "test-password")
        #expect(account.username == "member")
        #expect(store.token == "new-token")
        #expect(transport.requests.first?.path == "/v1/auth/login")
        #expect(transport.requests.first?.headerFields[.authorization] == nil)
    }

    @Test("A wrong password throws invalid_credentials and stores nothing")
    func wrongPassword() async {
        let (service, _, store) = service([.init(status: 401, json: errorJSON("invalid_credentials"))])
        await #expect(throws: APIError.self) { try await service.signIn(username: "member", password: "wrong") }
        #expect(store.token == nil)
    }

    @Test("Changing the password replaces the token; a wrong current one keeps it")
    func changePassword() async throws {
        let (service, transport, store) = service([
            .init(status: 401, json: errorJSON("invalid_credentials")),
            .init(status: 200, json: result),
        ], token: "old-token")
        await #expect(throws: APIError.self) { try await service.changePassword(current: "bad", new: "new-password-123") }
        #expect(store.token == "old-token")
        _ = try await service.changePassword(current: "old", new: "new-password-123")
        #expect(store.token == "new-token")
        #expect(transport.requests.first?.headerFields[.authorization] == "Bearer old-token")
    }

    @Test("Signing out forgets the token, then revokes it")
    func signOut() async {
        let (service, transport, store) = service([.init(status: 204)], token: "old-token")
        #expect(service.hasStoredSession)
        await service.signOut()
        #expect(store.token == nil)
        #expect(transport.requests.first?.path == "/v1/auth/logout")
        #expect(transport.requests.first?.headerFields[.authorization] == "Bearer old-token")
    }

    @Test("Signing out forgets the token even when the server can't be reached")
    func signOutOffline() async {
        let (service, _, store) = service([], token: "old-token")
        await service.signOut()
        #expect(store.token == nil)
    }
}

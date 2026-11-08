import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

/// The one networking layer (mac/AGENTS.md): the client generated from
/// api/openapi.yaml by swift-openapi-generator, with the auth middleware.
struct APIClient: AccountAPI {
    let client: Client

    init(
        serverURL: URL,
        token: @escaping AuthMiddleware.TokenProvider,
        onSessionError: @escaping @Sendable (APIError) -> Void,
        transport: any ClientTransport = URLSessionTransport()
    ) {
        client = Client(
            serverURL: serverURL,
            transport: transport,
            middlewares: [AuthMiddleware(token: token, onSessionError: onSessionError)]
        )
    }

    func me() async throws(APIError) -> Account {
        let output: Operations.GetMe.Output
        do {
            output = try await client.getMe()
        } catch {
            throw APIError.network()
        }
        switch output {
        case .ok(let ok):
            guard case .json(let me) = ok.body else { throw APIError.from(status: 200, body: nil) }
            return Account(
                id: me.id,
                email: me.email,
                displayName: me.displayName,
                role: me.role == .admin ? .admin : .member
            )
        case .unauthorized(let response):
            throw APIError.from(status: 401, body: try? response.body.json)
        case .forbidden(let response):
            throw APIError.from(status: 403, body: try? response.body.json)
        case .undocumented(let status, _):
            throw APIError.from(status: status, body: nil)
        }
    }
}

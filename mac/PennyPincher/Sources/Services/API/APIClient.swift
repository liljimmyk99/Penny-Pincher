import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

/// The one networking layer (mac/AGENTS.md): the client generated from
/// api/openapi.yaml by swift-openapi-generator, with the error and auth
/// middlewares. Each call maps the generated types to the app's models.
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
            middlewares: [ErrorMiddleware(), AuthMiddleware(token: token, onSessionError: onSessionError)]
        )
    }

    func me() async throws(APIError) -> Account {
        try await perform {
            let me = try await client.getMe().ok.body.json
            return Account(
                id: me.id,
                email: me.email,
                displayName: me.displayName,
                role: me.role == .admin ? .admin : .member
            )
        }
    }

    /// Runs one generated call. A failed answer arrives as the `APIError` that
    /// `ErrorMiddleware` threw; a request that never got an answer is a network
    /// error; anything else (an undocumented success, a body that doesn't
    /// decode) is an unexpected response.
    func perform<T>(_ call: () async throws -> T) async throws(APIError) -> T {
        do {
            return try await call()
        } catch let error as ClientError {
            if let api = error.underlyingError as? APIError { throw api }
            if error.response == nil { throw APIError.network() }
            throw APIError.unexpected(status: error.response?.status.code ?? 200)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.unexpected()
        }
    }
}

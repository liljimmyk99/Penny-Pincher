import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Adds `Authorization: Bearer <session token>` to every request except sign-in
/// (the same rules as the web client, `web/src/api/client.ts`). There is no
/// refresh and no retry: a session the API refuses is over.
/// - `401 unauthenticated` / `session_expired` and `403 password_change_required`
///   are reported through `onSessionError`.
/// - Everything else (`invalid_credentials`, `admin_required`, ...) is left to the caller.
struct AuthMiddleware: ClientMiddleware {
    typealias TokenProvider = @Sendable () -> String?

    let token: TokenProvider
    let onSessionError: @Sendable (APIError) -> Void

    private static let maxErrorBody = 64 * 1024

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        // Sign-in has no session (`security: []`); never send a stale token with it.
        if operationID != "login", let token = token() {
            request.headerFields[.authorization] = "Bearer \(token)"
        }

        var (response, responseBody) = try await next(request, body, baseURL)
        let status = response.status.code
        guard status == 401 || status == 403 else { return (response, responseBody) }

        let error = try await Self.readError(&responseBody, status: status)
        if error.isSessionError || error.isPasswordChangeRequired { onSessionError(error) }
        return (response, responseBody)
    }

    /// Reads the `Error` body and puts an unread copy back for the generated client.
    private static func readError(_ body: inout HTTPBody?, status: Int) async throws -> APIError {
        guard let current = body else { return APIError.decode(nil, status: status) }
        let data = try await Data(collecting: current, upTo: maxErrorBody)
        body = HTTPBody(data)
        return APIError.decode(data, status: status)
    }
}

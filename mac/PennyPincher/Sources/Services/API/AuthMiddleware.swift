import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Adds `Authorization: Bearer <Firebase ID token>` to every request (the same
/// rules as the web client, `web/src/api/client.ts`):
/// - A `401` other than `session_expired` is retried once with a refreshed token
///   (a refreshed token keeps its sign-in time, so it can't fix an expired session).
/// - A `401` that remains, or a `403 not_allowlisted`, is reported through
///   `onSessionError`, and the app signs out.
struct AuthMiddleware: ClientMiddleware {
    typealias TokenProvider = @Sendable (_ forceRefresh: Bool) async throws -> String?

    let token: TokenProvider
    let onSessionError: @Sendable (APIError) -> Void

    /// Bodies are buffered so a request can be sent twice; the largest the API
    /// accepts is the 11 MiB import upload.
    private static let maxBody = 16 * 1024 * 1024
    private static let maxErrorBody = 64 * 1024

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        let bodyData: Data? = if let body { try await Data(collecting: body, upTo: Self.maxBody) } else { nil }

        func send(_ token: String?) async throws -> (HTTPResponse, HTTPBody?) {
            var request = request
            if let token { request.headerFields[.authorization] = "Bearer \(token)" }
            return try await next(request, bodyData.map { HTTPBody($0) }, baseURL)
        }

        var (response, responseBody) = try await send(try await token(false))
        guard response.status.code == 401 || response.status.code == 403 else {
            return (response, responseBody)
        }

        var error = try await Self.readError(&responseBody, status: response.status.code)
        if response.status.code == 401 && error.code != "session_expired",
           let fresh = try await token(true) {
            (response, responseBody) = try await send(fresh)
            guard response.status.code == 401 || response.status.code == 403 else {
                return (response, responseBody)
            }
            error = try await Self.readError(&responseBody, status: response.status.code)
        }

        // `admin_required` (403) is not a session error; the caller handles it.
        if response.status.code == 401 || error.isSessionError { onSessionError(error) }
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

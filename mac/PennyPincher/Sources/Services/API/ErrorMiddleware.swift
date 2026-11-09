import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Turns every `4xx`/`5xx` answer into a thrown `APIError` (with the server's
/// `code`, `message` and `details`), so `APIClient` only maps successes. It runs
/// outside `AuthMiddleware`, so it sees the answer after any token refresh.
struct ErrorMiddleware: ClientMiddleware {
    private static let maxErrorBody = 64 * 1024

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        let (response, responseBody) = try await next(request, body, baseURL)
        let status = response.status.code
        guard status >= 400 else { return (response, responseBody) }
        let data: Data? = if let responseBody {
            try? await Data(collecting: responseBody, upTo: Self.maxErrorBody)
        } else {
            nil
        }
        throw APIError.decode(data, status: status)
    }
}

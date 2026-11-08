import Foundation

/// A failed API call: the server's stable `code` (`Error` in api/openapi.yaml),
/// or `network_error` when the server couldn't be reached. Branch on `code`,
/// never on `message`.
struct APIError: Error, Equatable, Sendable {
    var code: String
    var status: Int?
    var message: String

    static let networkCode = "network_error"

    static func network() -> APIError {
        APIError(code: networkCode, status: nil, message: String(localized: "api.error.network"))
    }

    /// From an HTTP status and the decoded `Error` body, when there was one.
    static func from(status: Int, body: Components.Schemas._Error?) -> APIError {
        if let body {
            return APIError(code: body.error.code.rawValue, status: status, message: body.error.message)
        }
        return APIError(code: status >= 500 ? "internal" : "unexpected_response", status: status,
                        message: String(localized: "api.error.server"))
    }

    /// The API refused this session, so the app signs out and says why:
    /// `unauthenticated` (still 401 after a token refresh), `session_expired`
    /// (the sign-in is over 30 days old) or `not_allowlisted` (403).
    var isSessionError: Bool {
        code == "unauthenticated" || code == "session_expired" || code == "not_allowlisted"
    }
}

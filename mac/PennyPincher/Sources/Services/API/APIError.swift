import Foundation

/// A failed API call: the server's stable `code` (`Error` in api/openapi.yaml),
/// or `network_error` when the server couldn't be reached. Branch on `code`,
/// never on `message`.
struct APIError: Error, Equatable, Sendable {
    /// One `details` entry: the field that failed (`items[3].amount_cents`) and why.
    struct Detail: Equatable, Sendable {
        var field: String
        var issue: String
    }

    var code: String
    var status: Int?
    var message: String
    var details: [Detail] = []

    static let networkCode = "network_error"

    static func network() -> APIError {
        APIError(code: networkCode, status: nil, message: String(localized: "api.error.network"))
    }

    /// The server answered with something the app can't read.
    static func unexpected(status: Int = 200) -> APIError {
        APIError(code: "unexpected_response", status: status, message: String(localized: "api.error.server"))
    }

    /// From an HTTP status and the decoded `Error` body, when there was one.
    static func from(status: Int, body: Components.Schemas._Error?) -> APIError {
        if let body {
            return APIError(
                code: body.error.code.rawValue,
                status: status,
                message: body.error.message,
                details: (body.error.details ?? []).map { Detail(field: $0.field, issue: $0.issue) }
            )
        }
        return APIError(code: status >= 500 ? "internal" : "unexpected_response", status: status,
                        message: String(localized: "api.error.server"))
    }

    /// From the raw body of a failed response. A `401` the app can't read is
    /// still a refused session.
    static func decode(_ data: Data?, status: Int) -> APIError {
        let decoded = data.flatMap { try? JSONDecoder().decode(Components.Schemas._Error.self, from: $0) }
        var error = from(status: status, body: decoded)
        if decoded == nil && status == 401 { error.code = "unauthenticated" }
        return error
    }

    /// The API refused this session, so the app signs out and says why:
    /// `unauthenticated` (still 401 after a token refresh), `session_expired`
    /// (the sign-in is over 30 days old) or `not_allowlisted` (403).
    var isSessionError: Bool {
        code == "unauthenticated" || code == "session_expired" || code == "not_allowlisted"
    }
}

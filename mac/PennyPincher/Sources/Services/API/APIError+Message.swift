import Foundation

extension APIError {
    /// Our own wording for the auth codes (web/src/api/errors.ts); the server's
    /// message for anything else.
    var userMessage: String {
        switch code {
        case "invalid_credentials": String(localized: "auth.error.invalidCredentials")
        case "session_expired", "unauthenticated": String(localized: "auth.error.sessionExpired")
        case "weak_password": String(localized: "auth.error.weakPassword")
        case "password_change_required": String(localized: "auth.error.passwordChangeRequired")
        case "rate_limited": String(localized: "auth.error.rateLimited")
        default: message
        }
    }
}

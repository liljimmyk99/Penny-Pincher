import Foundation

/// Why sign-in failed, in the app's own terms (mirrors `web/src/auth/errors.ts`).
struct AuthError: Error, Equatable {
    enum Code: Equatable, Sendable {
        case invalidCredentials
        case userNotFound
        case invalidEmail
        case userDisabled
        case noAccess
        case tooManyRequests
        case network
        case cancelled
        case providerDisabled
        case accountExists
        case googleUnavailable
        case unknown
    }

    var code: Code

    init(_ code: Code) { self.code = code }

    /// A message safe to show. Empty for `cancelled` (the person closed the Google window).
    var message: String {
        switch code {
        // An unknown account reads like a wrong password: no account enumeration.
        case .invalidCredentials, .userNotFound: String(localized: "auth.error.invalidCredentials")
        case .invalidEmail: String(localized: "auth.error.invalidEmail")
        case .userDisabled: String(localized: "auth.error.userDisabled")
        case .noAccess: String(localized: "auth.error.noAccess")
        case .tooManyRequests: String(localized: "auth.error.tooManyRequests")
        case .network: String(localized: "auth.error.network")
        case .cancelled: ""
        case .providerDisabled: String(localized: "auth.error.providerDisabled")
        case .accountExists: String(localized: "auth.error.accountExists")
        case .googleUnavailable: String(localized: "auth.error.googleUnavailable")
        case .unknown: String(localized: "auth.error.unknown")
        }
    }

    /// True when the email/password pair was wrong (mark the password field invalid).
    var isCredentialError: Bool { code == .invalidCredentials || code == .userNotFound }
}

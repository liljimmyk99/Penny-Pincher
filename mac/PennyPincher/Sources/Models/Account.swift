import Foundation

/// The signed-in user, as the app shows them (`Me` in api/openapi.yaml).
struct Account: Equatable, Sendable {
    enum Role: String, Sendable { case admin, member }

    var id: String
    var email: String?
    var displayName: String?
    var role: Role

    /// Their display name, else their email (web/src/shell/me.ts).
    var name: String {
        if let displayName = displayName?.trimmingCharacters(in: .whitespacesAndNewlines), !displayName.isEmpty {
            return displayName
        }
        if let email, !email.isEmpty { return email }
        return String(localized: "account.fallbackName")
    }

    var isAdmin: Bool { role == .admin }

    /// The first letter or digit of `name`, for the avatar.
    var initial: String {
        name.first(where: { $0.isLetter || $0.isNumber }).map { String($0).uppercased() } ?? "?"
    }
}

import Foundation

/// The signed-in user, as the app shows them (`Me` in api/openapi.yaml).
struct Account: Equatable, Sendable {
    enum Role: String, Sendable { case admin, member }

    var id: String
    var username: String
    var email: String?
    var displayName: String?
    var role: Role
    /// An admin set or reset the password: the person must choose their own first.
    var mustChangePassword = false

    /// Their display name, else their username (web/src/shell/me.ts).
    var name: String {
        if let displayName = displayName?.trimmingCharacters(in: .whitespacesAndNewlines), !displayName.isEmpty {
            return displayName
        }
        if !username.isEmpty { return username }
        return String(localized: "account.fallbackName")
    }

    var isAdmin: Bool { role == .admin }

    /// The first letter or digit of `name`, for the avatar.
    var initial: String {
        name.first(where: { $0.isLetter || $0.isNumber }).map { String($0).uppercased() } ?? "?"
    }

    init(id: String, username: String, email: String? = nil, displayName: String? = nil,
         role: Role, mustChangePassword: Bool = false) {
        self.id = id
        self.username = username
        self.email = email
        self.displayName = displayName
        self.role = role
        self.mustChangePassword = mustChangePassword
    }

    init(_ me: Components.Schemas.Me) {
        self.init(id: me.id, username: me.username, email: me.email, displayName: me.displayName,
                  role: me.role == .admin ? .admin : .member, mustChangePassword: me.mustChangePassword)
    }
}

import Foundation
import Observation

/// Change password (web/src/auth/ChangePasswordForm.tsx), for the forced screen
/// and the account-menu sheet. Passwords live only in these fields: they are
/// cleared after every attempt that reaches the server.
@MainActor
@Observable
final class ChangePasswordViewModel {
    static let minimumLength = 12

    let mode: ChangePasswordMode
    var current = ""
    var new = ""
    var repeated = ""
    private(set) var isSaving = false
    private(set) var error: APIError?

    @ObservationIgnored private let session: SessionService
    @ObservationIgnored private let onChanged: @MainActor () -> Void

    init(session: SessionService, mode: ChangePasswordMode, onChanged: @escaping @MainActor () -> Void = {}) {
        self.session = session
        self.mode = mode
        self.onChanged = onChanged
    }

    // MARK: State

    var requirements: [PasswordRequirement] {
        [
            PasswordRequirement(id: "length", title: String(localized: "changePassword.rule.length"),
                                isMet: new.count >= Self.minimumLength),
            PasswordRequirement(id: "different", title: String(localized: "changePassword.rule.different"),
                                isMet: !new.isEmpty && new != current),
            PasswordRequirement(id: "match", title: String(localized: "changePassword.rule.match"),
                                isMet: !new.isEmpty && new == repeated),
        ]
    }

    var canSubmit: Bool {
        !isSaving && !current.isEmpty && requirements.allSatisfy(\.isMet)
    }

    var secondaryTitle: LocalizedStringResource {
        mode == .forced ? "account.signOut" : "common.cancel"
    }

    var submitTitle: LocalizedStringResource {
        isSaving ? "changePassword.submit.busy" : "changePassword.submit"
    }

    var isCurrentInvalid: Bool { error?.code == "invalid_credentials" }
    var isNewInvalid: Bool { error?.code == "weak_password" }

    var currentError: String? {
        isCurrentInvalid ? String(localized: "changePassword.error.current") : nil
    }

    var newError: String? {
        guard let error, isNewInvalid else { return nil }
        return error.details.first(where: { $0.field == "new_password" })?.issue ?? error.userMessage
    }

    /// Anything not tied to a field.
    var generalError: String? {
        guard let error, !isCurrentInvalid, !isNewInvalid else { return nil }
        return error.userMessage
    }

    // MARK: Actions

    func submit() async {
        guard canSubmit else { return }
        let old = current, next = new
        isSaving = true
        error = nil
        defer { isSaving = false }
        do throws(APIError) {
            try await session.changePassword(current: old, new: next)
            clear()
            onChanged()
        } catch {
            self.error = error
        }
    }

    /// Cancel (sheet) or Sign out (forced).
    func secondary() {
        clear()
        if mode == .forced { session.signOut() } else { onChanged() }
    }

    func reset() {
        clear()
        error = nil
    }

    private func clear() {
        current = ""
        new = ""
        repeated = ""
    }
}

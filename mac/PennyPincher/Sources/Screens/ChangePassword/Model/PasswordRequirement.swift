import Foundation

/// One line of the live checklist.
struct PasswordRequirement: Identifiable, Equatable {
    let id: String
    let title: String
    let isMet: Bool
}

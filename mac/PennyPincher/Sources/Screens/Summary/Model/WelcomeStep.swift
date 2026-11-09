import Foundation

/// One step of the new-account checklist.
struct WelcomeStep: Identifiable, Equatable {
    enum Kind: String {
        case categories
        case template
        case entry
    }

    var kind: Kind
    var title: LocalizedStringResource
    var detail: LocalizedStringResource
    var isDone: Bool

    var id: String { kind.rawValue }
}

import Foundation

/// Where keyboard focus is on Add entries.
enum EntryFocus: Hashable {
    case merchant(UUID)
    case amount(UUID)
    case note(UUID)
    case incomeGross
}

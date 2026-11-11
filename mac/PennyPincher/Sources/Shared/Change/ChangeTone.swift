/// What a change means, not which way it went (root AGENTS.md §6.11): spending
/// up is worse (orange), down is better (blue). For Saving the meaning flips.
enum ChangeTone: Equatable, Sendable {
    case worse
    case better
    case none

    /// `deltaCents` is current minus previous.
    static func of(deltaCents: Int, isSaving: Bool) -> ChangeTone {
        if deltaCents == 0 { return .none }
        return (deltaCents > 0) != isSaving ? .worse : .better
    }
}

import Foundation

/// A category or income source as its row shows it. `columns` follow the
/// section's headers: entries (all time) then the year-to-date money columns.
struct ManagedRow: Identifiable, Equatable {
    var id: String
    var name: String
    var columns: [String]
    var badges: [RowBadge]
    /// The protected "Other": no rename, delete or drag.
    var isLocked: Bool
    var canDelete: Bool
    /// Why Delete is unavailable, when it's shown disabled (a source with entries).
    var deleteHelp: LocalizedStringResource?
    var canMoveUp: Bool
    var canMoveDown: Bool
}

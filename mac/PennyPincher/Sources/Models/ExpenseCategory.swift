/// An expense category (`Category` in api/openapi.yaml). "Other" is protected:
/// it can be recoloured and reordered but never renamed or deleted. Saving is
/// recognised by `isSaving`, never by its name.
struct ExpenseCategory: Identifiable, Equatable, Hashable, Sendable {
    var id: String
    var name: String
    /// `#RRGGBB`, or nil for the default colour.
    var color: String?
    var isSaving: Bool
    var isProtected: Bool
    var sortOrder: Int
}

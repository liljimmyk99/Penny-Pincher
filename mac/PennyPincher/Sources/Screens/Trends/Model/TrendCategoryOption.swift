/// An entry in the By category picker: "All spending" (no id) or a category.
struct TrendCategoryOption: Identifiable, Equatable {
    /// Nil for all spending.
    var categoryID: String?
    var name: String
    var isSaving: Bool

    var id: String { categoryID ?? "" }
}

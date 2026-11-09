/// Every category in order, with the template's items in it (empty ones included).
struct TemplateCategoryGroup: Identifiable, Equatable, Sendable {
    var id: String
    var name: String
    var isSaving: Bool
    var rows: [TemplateExpenseRow]
    var totalText: String
}

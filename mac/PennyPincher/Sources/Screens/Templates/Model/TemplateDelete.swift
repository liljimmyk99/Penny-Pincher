/// What a confirmed delete removes: a whole template, or one of its items.
struct TemplateDelete: Identifiable, Equatable, Sendable {
    enum Target: Equatable, Sendable {
        case template(id: String)
        case expenseItem(id: String)
        case incomeItem(id: String)
    }

    var target: Target
    var title: String
    var message: String
    var confirmTitle: String

    var id: String {
        switch target {
        case .template(let id): "template-\(id)"
        case .expenseItem(let id): "expense-\(id)"
        case .incomeItem(let id): "income-\(id)"
        }
    }
}

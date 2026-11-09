/// A bill in the template editor, labelled "<merchant> · <note>".
struct TemplateExpenseRow: Identifiable, Equatable, Sendable {
    var id: String
    var dayText: String
    var title: String
    var amountText: String
}

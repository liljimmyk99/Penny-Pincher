/// One line of a template preview: a paycheck or a bill, with its day of month.
struct TemplatePreviewRow: Identifiable, Equatable, Sendable {
    var id: String
    var day: Int
    var title: String
    var amountText: String
    var isIncome: Bool

    var dayText: String { String(day) }
}

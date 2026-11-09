/// A paycheck in the template editor. The label is the item's note.
struct TemplateIncomeRow: Identifiable, Equatable, Sendable {
    var id: String
    var dayText: String
    var source: String
    var label: String
    var grossText: String
    var taxableText: String
    var netText: String
    var taxRateText: String
}

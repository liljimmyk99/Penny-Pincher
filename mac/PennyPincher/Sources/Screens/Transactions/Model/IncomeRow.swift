/// An income entry as the income table shows it.
struct IncomeRow: Identifiable, Equatable {
    var id: String
    var date: String
    var dateText: String
    var source: String
    var label: String
    var grossText: String
    var taxableText: String
    var netText: String
    var taxRateText: String
    var isUnconfirmed: Bool
}

/// An income source that has entries this month; opens its entries.
struct IncomeSourceRow: Identifiable, Equatable {
    var id: String
    var name: String
    var entryCount: Int
    var grossText: String
    var netText: String
    var taxRateText: String
}

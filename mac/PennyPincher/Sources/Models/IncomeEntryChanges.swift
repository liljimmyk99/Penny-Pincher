/// The fields of an income entry being changed (`IncomeEntryUpdate`); nil
/// leaves a field as it is, and an empty note clears it.
struct IncomeEntryChanges: Equatable, Sendable {
    var date: String?
    var incomeSourceID: String?
    var grossCents: Int?
    var grossTaxableCents: Int?
    var netCents: Int?
    var note: String?
    var confirmed: Bool?

    var isEmpty: Bool { self == IncomeEntryChanges() }
}

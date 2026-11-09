/// The fields of the income form, for errors and focus.
enum IncomeField: Hashable, Sendable {
    case source
    case date
    case gross
    case taxable
    case net
    case label
}

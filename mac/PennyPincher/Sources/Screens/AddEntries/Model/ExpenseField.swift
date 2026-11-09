/// The fields of a batch row, for errors and focus.
enum ExpenseField: String, Hashable, Sendable {
    case date
    case merchant
    case category
    case amount
    case note
    case link

    /// The API's name for the field in a batch error (`items[2].amount_cents`).
    init?(apiField: String) {
        switch apiField {
        case "date": self = .date
        case "merchant_name": self = .merchant
        case "category_id": self = .category
        case "amount_cents": self = .amount
        case "note": self = .note
        case "refunded_expense_id": self = .link
        default: return nil
        }
    }
}

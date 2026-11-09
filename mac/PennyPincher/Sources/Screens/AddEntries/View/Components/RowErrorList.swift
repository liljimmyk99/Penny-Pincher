import SwiftUI

/// A row's errors, in field order.
struct RowErrorList: View {
    let errors: [ExpenseField: String]

    private static let order: [ExpenseField] = [.date, .merchant, .category, .amount, .note, .link]

    var body: some View {
        ForEach(Self.order.filter { errors[$0] != nil }, id: \.self) { field in
            FieldError(message: errors[field])
        }
    }
}

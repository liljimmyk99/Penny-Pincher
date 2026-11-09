import SwiftUI

/// The income form's errors, in field order.
struct IncomeErrorList: View {
    let errors: [IncomeField: String]

    private static let order: [IncomeField] = [.source, .date, .gross, .taxable, .net, .label]

    var body: some View {
        ForEach(Self.order.filter { errors[$0] != nil }, id: \.self) { field in
            FieldError(message: errors[field])
        }
    }
}

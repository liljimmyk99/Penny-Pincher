import SwiftUI

/// "Refund for": the merchant's past expenses. Linking is optional.
struct RefundLinkPicker: View {
    let number: Int
    let candidates: [Expense]?
    let hasMerchant: Bool
    @Binding var selection: String?

    var body: some View {
        HStack(spacing: 8) {
            Pill(text: Text("add.refund.badge"), foreground: .refund, background: .refund.opacity(0.12))
            Picker("add.refundFor", selection: $selection) {
                Text("refund.tag.unlinked").tag(String?.none)
                ForEach(candidates ?? []) { expense in
                    Text(Refunds.describe(expense)).tag(Optional(expense.id))
                }
            }
            .accessibilityLabel(Text("add.field.refundFor \(number)"))
            .frame(maxWidth: 420)
            .disabled(!hasMerchant)
            if !hasMerchant {
                Text("add.refund.pickMerchant")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

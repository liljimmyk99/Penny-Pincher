import SwiftUI

/// One row of the batch: date, merchant (autocompletes), category, amount and
/// note. Return moves to the next row. A refund row is tinted and can link to
/// the original expense.
struct ExpenseRowEditor: View {
    @Binding var row: ExpenseRow
    let number: Int
    let categories: [ExpenseCategory]
    let suggestions: [Merchant]
    let refundCandidates: [Expense]?
    let errors: [ExpenseField: String]
    let canRemove: Bool
    let category: Binding<String>
    let refundLink: Binding<String?>
    var focus: FocusState<EntryFocus?>.Binding
    let onSubmit: (UUID) -> Void
    let onRemove: (UUID) -> Void
    let onMerchantChange: (UUID) -> Void
    let onNeedRefundCandidates: (UUID) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                DatePicker(String(localized: "add.field.date \(number)"), selection: $row.date.calendarDate,
                           displayedComponents: .date)
                    .labelsHidden()
                    .datePickerStyle(.field)
                    .frame(width: EntryColumns.date, alignment: .leading)
                MerchantField(rowID: row.id, number: number, text: $row.merchant, suggestions: suggestions,
                              invalid: errors[.merchant] != nil, focus: focus, onSubmit: onSubmit)
                    .frame(minWidth: 150)
                CategoryPicker(title: "add.column.category", categories: categories, selection: category)
                    .labelsHidden()
                    .accessibilityLabel(Text("add.field.category \(number)"))
                    .frame(width: EntryColumns.category)
                MoneyField(title: "add.column.amount", text: $row.amount, invalid: errors[.amount] != nil)
                    .accessibilityLabel(Text("add.field.amount \(number)"))
                    .focused(focus, equals: .amount(row.id))
                    .onSubmit { onSubmit(row.id) }
                    .frame(width: EntryColumns.amount)
                TextField("add.column.note", text: $row.note, prompt: Text("add.note.prompt"))
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel(Text("add.field.note \(number)"))
                    .focused(focus, equals: .note(row.id))
                    .onSubmit { onSubmit(row.id) }
                    .frame(minWidth: 120)
                Button(String(localized: "add.removeRow \(number)"), systemImage: "minus.circle") { onRemove(row.id) }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.borderless)
                    .disabled(!canRemove)
                    .help(Text("add.removeRow.help"))
            }
            if row.isRefund {
                RefundLinkPicker(number: number, candidates: refundCandidates, hasMerchant: row.merchantID != nil,
                                 selection: refundLink)
                    .task(id: row.merchantID) { onNeedRefundCandidates(row.id) }
            }
            RowErrorList(errors: errors)
        }
        .padding(6)
        .background(row.isRefund ? Color.refundBackground : Color.clear, in: .rect(cornerRadius: 6))
        .onChange(of: row.merchant) { onMerchantChange(row.id) }
    }
}

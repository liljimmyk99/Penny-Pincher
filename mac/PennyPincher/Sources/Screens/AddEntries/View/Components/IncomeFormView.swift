import SwiftUI

/// Add an income entry: source, date, gross, gross taxable, net and an optional label.
struct IncomeFormView: View {
    @Binding var form: IncomeForm
    let sources: [IncomeSource]
    let errors: [IncomeField: String]
    let isSaving: Bool
    let canEdit: Bool
    var focus: FocusState<EntryFocus?>.Binding
    let onSave: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                SourcePicker(title: "income.field.source", sources: sources, selection: $form.sourceID)
                    .frame(maxWidth: 240)
                DatePicker("income.field.date", selection: $form.date.calendarDate, displayedComponents: .date)
                    .datePickerStyle(.field)
            }
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                LabeledContent("income.field.gross") {
                    MoneyField(title: "income.field.gross", text: $form.gross, invalid: errors[.gross] != nil)
                        .focused(focus, equals: .incomeGross)
                        .onSubmit(onSave)
                        .frame(width: 110)
                }
                LabeledContent("income.field.taxable") {
                    MoneyField(title: "income.field.taxable", text: $form.taxable, invalid: errors[.taxable] != nil)
                        .onSubmit(onSave)
                        .frame(width: 110)
                }
                LabeledContent("income.field.net") {
                    MoneyField(title: "income.field.net", text: $form.net, invalid: errors[.net] != nil)
                        .onSubmit(onSave)
                        .frame(width: 110)
                }
            }
            TextField("income.field.label", text: $form.label, prompt: Text("income.label.prompt"))
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 420)
                .onSubmit(onSave)
            IncomeErrorList(errors: errors)
            HStack {
                Spacer()
                if isSaving {
                    ProgressView().controlSize(.small)
                }
                Button("income.save", action: onSave)
                    .disabled(isSaving || !canEdit)
            }
        }
        .disabled(!canEdit)
    }
}

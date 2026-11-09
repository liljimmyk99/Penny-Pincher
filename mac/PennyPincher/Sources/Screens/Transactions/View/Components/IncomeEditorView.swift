import SwiftUI

/// The Edit income sheet.
struct IncomeEditorView: View {
    @Bindable var viewModel: IncomeEditorViewModel
    let onSave: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("edit.income.title").font(.title3.weight(.semibold))
            Form {
                SourcePicker(title: "income.field.source", sources: viewModel.sources, selection: $viewModel.form.sourceID)
                DatePicker("income.field.date", selection: $viewModel.form.date.calendarDate, displayedComponents: .date)
                    .datePickerStyle(.field)
                MoneyField(title: "income.field.gross", text: $viewModel.form.gross,
                           invalid: viewModel.errors[.gross] != nil)
                MoneyField(title: "income.field.taxable", text: $viewModel.form.taxable,
                           invalid: viewModel.errors[.taxable] != nil)
                MoneyField(title: "income.field.net", text: $viewModel.form.net, invalid: viewModel.errors[.net] != nil)
                TextField("income.field.label", text: $viewModel.form.label)
            }
            IncomeErrorList(errors: viewModel.errors)
            FieldError(message: viewModel.errorMessage)
            SheetButtons(isSaving: viewModel.isSaving, canSave: true, saveTitle: "common.save",
                         onSave: onSave, onCancel: onCancel)
        }
        .padding(20)
        .frame(width: 440)
    }
}

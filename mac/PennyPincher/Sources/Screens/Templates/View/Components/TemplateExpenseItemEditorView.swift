import SwiftUI

/// The sheet that adds or edits a template's expense item.
struct TemplateExpenseItemEditorView: View {
    @Bindable var viewModel: TemplateExpenseItemEditorViewModel
    let onSave: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(viewModel.title).font(.title3.weight(.semibold))
            Form {
                TextField("add.column.merchant", text: $viewModel.merchant)
                FieldError(message: viewModel.errors[.merchant])
                TextField("add.column.note", text: $viewModel.note)
                FieldError(message: viewModel.errors[.note])
                CategoryPicker(title: "add.column.category", categories: viewModel.categories, selection: $viewModel.categoryID)
                FieldError(message: viewModel.errors[.category])
                TextField("templates.field.day", text: $viewModel.day)
                    .monospacedDigit()
                FieldError(message: viewModel.errors[.day])
                MoneyField(title: "add.column.amount", text: $viewModel.amount, invalid: viewModel.errors[.amount] != nil)
                FieldError(message: viewModel.errors[.amount])
            }
            FieldError(message: viewModel.errorMessage)
            SheetButtons(isSaving: viewModel.isSaving, canSave: true, saveTitle: "common.save",
                         onSave: onSave, onCancel: onCancel)
        }
        .padding(20)
        .frame(width: 440)
    }
}

import SwiftUI

/// The Edit expense sheet. A negative amount makes it a refund.
struct ExpenseEditorView: View {
    @Bindable var viewModel: ExpenseEditorViewModel
    let onSave: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(viewModel.title).font(.title3.weight(.semibold))
            Form {
                DatePicker("add.column.date", selection: $viewModel.date.calendarDate, displayedComponents: .date)
                    .datePickerStyle(.field)
                TextField("add.column.merchant", text: $viewModel.merchant)
                FieldError(message: viewModel.error(.merchant))
                CategoryPicker(title: "add.column.category", categories: viewModel.categories,
                               selection: $viewModel.categoryID)
                FieldError(message: viewModel.error(.category))
                MoneyField(title: "add.column.amount", text: $viewModel.amount, invalid: viewModel.error(.amount) != nil)
                FieldError(message: viewModel.error(.amount))
                TextField("add.column.note", text: $viewModel.note)
                FieldError(message: viewModel.error(.note))
            }
            Text("edit.expense.refundHint")
                .font(.caption)
                .foregroundStyle(.secondary)
            FieldError(message: viewModel.errorMessage)
            SheetButtons(isSaving: viewModel.isSaving, canSave: true, saveTitle: "common.save",
                         onSave: onSave, onCancel: onCancel)
        }
        .padding(20)
        .frame(width: 440)
    }
}

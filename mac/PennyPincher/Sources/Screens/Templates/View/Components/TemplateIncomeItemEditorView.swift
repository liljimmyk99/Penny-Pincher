import SwiftUI

/// The sheet that adds or edits a template's income item.
struct TemplateIncomeItemEditorView: View {
    @Bindable var viewModel: TemplateIncomeItemEditorViewModel
    let onSave: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(viewModel.title).font(.title3.weight(.semibold))
            Form {
                SourcePicker(title: "income.field.source", sources: viewModel.sources, selection: $viewModel.sourceID)
                FieldError(message: viewModel.errors[.source])
                TextField("income.field.label", text: $viewModel.label)
                FieldError(message: viewModel.errors[.note])
                TextField("templates.field.day", text: $viewModel.day)
                    .monospacedDigit()
                FieldError(message: viewModel.errors[.day])
                MoneyField(title: "income.field.gross", text: $viewModel.gross, invalid: viewModel.errors[.gross] != nil)
                FieldError(message: viewModel.errors[.gross])
                MoneyField(title: "income.field.taxable", text: $viewModel.taxable, invalid: viewModel.errors[.taxable] != nil)
                FieldError(message: viewModel.errors[.taxable])
                MoneyField(title: "income.field.net", text: $viewModel.net, invalid: viewModel.errors[.net] != nil)
                FieldError(message: viewModel.errors[.net])
            }
            FieldError(message: viewModel.errorMessage)
            SheetButtons(isSaving: viewModel.isSaving, canSave: true, saveTitle: "common.save",
                         onSave: onSave, onCancel: onCancel)
        }
        .padding(20)
        .frame(width: 440)
    }
}

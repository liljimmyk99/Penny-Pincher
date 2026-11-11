import SwiftUI

/// Choose Excel or CSV, then save the file with a save panel.
struct ExportSheet: View {
    @Bindable var viewModel: ExportViewModel
    let onExport: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("export.title").font(.title3.weight(.semibold))
            Text("export.detail")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Picker("export.format", selection: $viewModel.format) {
                ForEach(viewModel.formats) { format in
                    Text(format.title).tag(format)
                }
            }
            .pickerStyle(.radioGroup)
            FieldError(message: viewModel.errorMessage)
            SheetButtons(isSaving: viewModel.isWorking, canSave: true, saveTitle: "export.button",
                         onSave: onExport, onCancel: onCancel)
        }
        .padding(20)
        .frame(width: 420)
    }
}

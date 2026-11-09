import SwiftUI

/// Apply the chosen template to a month. A month with data asks to reset first.
struct ApplyTemplateSheet: View {
    let title: String
    let month: MonthSelection
    let errorMessage: String?
    let isWorking: Bool
    let onPrevious: () -> Void
    let onNext: () -> Void
    let onApply: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title).font(.title3.weight(.semibold))
            Text("templates.apply.detail")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            MonthSwitcher(month: month, onPrevious: onPrevious, onNext: onNext)
            FieldError(message: errorMessage)
            SheetButtons(isSaving: isWorking, canSave: true, saveTitle: "templates.apply.button",
                         onSave: onApply, onCancel: onCancel)
        }
        .padding(20)
        .frame(width: 420)
    }
}

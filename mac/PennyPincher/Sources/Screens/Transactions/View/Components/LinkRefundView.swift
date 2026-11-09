import SwiftUI

/// Link… for an unlinked refund: search recent expenses, Suggested first and preselected.
struct LinkRefundView: View {
    @Bindable var viewModel: LinkRefundViewModel
    let onLink: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("link.title").font(.title3.weight(.semibold))
            Text(viewModel.refundText).foregroundStyle(.secondary)
            TextField("link.search", text: $viewModel.search, prompt: Text("link.search.prompt"))
                .textFieldStyle(.roundedBorder)
            if let message = viewModel.phase.errorMessage {
                FieldError(message: message)
            } else if viewModel.phase == .loading {
                ProgressView().frame(maxWidth: .infinity, minHeight: 200)
            } else if viewModel.visible.isEmpty {
                Text("link.empty")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 200)
            } else {
                List(viewModel.visible, selection: $viewModel.selectedID) { expense in
                    LinkCandidateRow(expense: expense, isSuggested: viewModel.isSuggested(expense))
                        .tag(expense.id)
                }
                .frame(minHeight: 240)
            }
            Text("link.hint").font(.caption).foregroundStyle(.secondary)
            FieldError(message: viewModel.errorMessage)
            SheetButtons(isSaving: viewModel.isSaving, canSave: viewModel.canLink, saveTitle: "link.confirm",
                         onSave: onLink, onCancel: onCancel)
        }
        .padding(20)
        .frame(width: 520)
    }
}

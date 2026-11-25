import SwiftUI

/// The forced "Choose a new password" screen, and the account-menu sheet.
struct ChangePasswordView: View {
    @Bindable var viewModel: ChangePasswordViewModel
    @FocusState var focus: ChangePasswordField?

    var body: some View {
        Group {
            switch viewModel.mode {
            case .forced:
                VStack(spacing: 0) {
                    Spacer(minLength: 24)
                    SignInCard { ChangePasswordCard(viewModel: viewModel, focus: $focus, onSubmit: submit, onSecondary: secondary) }
                    Spacer(minLength: 24)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .sheet:
                VStack(alignment: .leading, spacing: 14) { ChangePasswordCard(viewModel: viewModel, focus: $focus, onSubmit: submit, onSecondary: secondary) }
                    .padding(20)
                    .frame(width: 380)
            }
        }
        .disabled(viewModel.isSaving)
        .onAppear { focus = .current }
    }
}

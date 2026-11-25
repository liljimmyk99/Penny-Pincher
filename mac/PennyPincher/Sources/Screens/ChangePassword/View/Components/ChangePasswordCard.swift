import SwiftUI

/// Heading and form, shared by the forced screen and the sheet.
struct ChangePasswordCard: View {
    @Bindable var viewModel: ChangePasswordViewModel
    var focus: FocusState<ChangePasswordField?>.Binding
    let onSubmit: () -> Void
    let onSecondary: () -> Void

    var body: some View {
        SignInHeading(
            title: viewModel.mode == .forced ? "changePassword.forced.title" : "changePassword.title",
            detail: viewModel.mode == .forced ? "changePassword.forced.detail" : "changePassword.detail"
        )
        ChangePasswordForm(viewModel: viewModel, focus: focus, onSubmit: onSubmit, onSecondary: onSecondary)
    }
}

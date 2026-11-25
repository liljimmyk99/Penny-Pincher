import SwiftUI

/// Three password fields, the checklist and the two buttons.
struct ChangePasswordForm: View {
    @Bindable var viewModel: ChangePasswordViewModel
    var focus: FocusState<ChangePasswordField?>.Binding
    let onSubmit: () -> Void
    let onSecondary: () -> Void

    var body: some View {
        if let message = viewModel.generalError {
            ErrorBanner(message: message)
        }

        VStack(alignment: .leading, spacing: 10) {
            PasswordField(title: viewModel.mode == .forced ? "changePassword.temporary" : "changePassword.current", password: $viewModel.current,
                          invalid: viewModel.isCurrentInvalid, contentType: .password,
                          focus: focus, field: ChangePasswordField.current, onSubmit: { focus.wrappedValue = .new })
            FieldError(message: viewModel.currentError)
            PasswordField(title: "changePassword.new", password: $viewModel.new,
                          invalid: viewModel.isNewInvalid, contentType: .newPassword,
                          focus: focus, field: ChangePasswordField.new, onSubmit: { focus.wrappedValue = .repeated })
            FieldError(message: viewModel.newError)
            PasswordField(title: "changePassword.repeat", password: $viewModel.repeated,
                          invalid: false, contentType: .newPassword,
                          focus: focus, field: ChangePasswordField.repeated, onSubmit: onSubmit)
        }

        VStack(alignment: .leading, spacing: 4) {
            ForEach(viewModel.requirements) { RequirementRow(requirement: $0) }
        }

        Text("changePassword.note")
            .font(.callout)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)

        ActionButton(title: viewModel.submitTitle, isBusy: viewModel.isSaving,
                     isEnabled: viewModel.canSubmit, action: onSubmit)
        Button(action: onSecondary) {
            Text(viewModel.secondaryTitle).frame(maxWidth: .infinity)
        }
        .controlSize(.large)
    }
}

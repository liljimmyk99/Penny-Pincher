import SwiftUI

/// The Settings window (⌘,).
struct SettingsView: View {
    @Bindable var viewModel: SettingsViewModel

    var body: some View {
        Form {
            AppearancePicker(selection: $viewModel.appearance, options: viewModel.appearanceOptions)
        }
        .formStyle(.grouped)
        .frame(width: 380)
        .fixedSize(horizontal: false, vertical: true)
    }
}

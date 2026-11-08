import SwiftUI

/// The screen's main, full-width button, with a spinner while busy.
/// It is the default action (Return).
struct ActionButton: View {
    let title: LocalizedStringResource
    var isBusy = false
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ActionButtonLabel(title: title, isBusy: isBusy)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .keyboardShortcut(.defaultAction)
        .disabled(!isEnabled)
    }
}

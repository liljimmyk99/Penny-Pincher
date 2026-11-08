import SwiftUI

/// A full-width, standard-style button that is the default action (Return).
struct SecondaryActionButton: View {
    let title: LocalizedStringResource
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ActionButtonLabel(title: title, isBusy: false)
        }
        .controlSize(.large)
        .keyboardShortcut(.defaultAction)
    }
}

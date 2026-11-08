import SwiftUI

/// After the reset link was sent.
struct ResetSentView: View {
    let onBack: () -> Void

    var body: some View {
        ResetSentMessage()
        SignInHeading(title: "signIn.sent.title", detail: "signIn.sent.detail")
        SecondaryActionButton(title: "signIn.backToSignIn", action: onBack)
    }
}

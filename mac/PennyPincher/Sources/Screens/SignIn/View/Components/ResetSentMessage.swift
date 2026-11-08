import SwiftUI

struct ResetSentMessage: View {
    var body: some View {
        Label {
            Text("signIn.sent.message")
        } icon: {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(Color.income)
        }
    }
}

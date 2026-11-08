import SwiftUI

struct GoogleSignInButton: View {
    let title: LocalizedStringResource
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label {
                Text(title)
            } icon: {
                Image(systemName: "person.crop.circle")
            }
            .frame(maxWidth: .infinity)
        }
        .controlSize(.large)
    }
}

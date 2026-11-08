import SwiftUI

struct SignInFooter: View {
    var body: some View {
        Label("signIn.footer", systemImage: "lock.fill")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .padding(.bottom, 20)
    }
}

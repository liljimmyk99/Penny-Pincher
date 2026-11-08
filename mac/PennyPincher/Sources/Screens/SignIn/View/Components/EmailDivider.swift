import SwiftUI

/// "or sign in with email" between two rules.
struct EmailDivider: View {
    var body: some View {
        HStack {
            VStack { Divider() }
            Text("signIn.orEmail")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize()
            VStack { Divider() }
        }
    }
}

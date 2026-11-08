import SwiftUI

/// The rounded card the sign-in content sits on.
struct SignInCard<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            content
        }
        .frame(width: 340)
        .padding(28)
        .background(.background.secondary, in: .rect(cornerRadius: 16))
    }
}

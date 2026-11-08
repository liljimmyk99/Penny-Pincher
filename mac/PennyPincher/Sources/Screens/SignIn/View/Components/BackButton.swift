import SwiftUI

struct BackButton: View {
    let action: () -> Void

    var body: some View {
        Button("signIn.back", systemImage: "chevron.left", action: action)
            .buttonStyle(.link)
    }
}

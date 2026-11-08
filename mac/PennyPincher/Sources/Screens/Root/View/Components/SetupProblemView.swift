import SwiftUI

/// Shown instead of the app when Config/Local.xcconfig is incomplete or unsafe.
struct SetupProblemView: View {
    let message: String

    var body: some View {
        StatusView {
            Label("root.setupProblem.title", systemImage: "gearshape.2")
                .font(.headline)
            Text(message)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .textSelection(.enabled)
        }
    }
}

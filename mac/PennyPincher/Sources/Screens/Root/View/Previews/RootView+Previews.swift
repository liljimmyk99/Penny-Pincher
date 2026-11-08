#if DEBUG
import SwiftUI

#Preview("Setup problem") {
    RootView(viewModel: PreviewData.misconfiguredRoot())
}

#Preview("Restoring") {
    RootView(viewModel: PreviewData.root(.restoring))
}

#Preview("Loading account") {
    RootView(viewModel: PreviewData.root(.signedIn, answer: .never))
}

#Preview("Server unreachable") {
    RootView(viewModel: PreviewData.root(.signedIn, answer: .failure(.network())))
}

#Preview("Signed out") {
    RootView(viewModel: PreviewData.root(.signedOut))
}

#Preview("Signed in") {
    RootView(viewModel: PreviewData.root(.signedIn))
}
#endif

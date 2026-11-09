#if DEBUG
import SwiftUI

#Preview("Batch") {
    NavigationStack {
        AddEntriesView(viewModel: PreviewData.addEntries())
    }
    .frame(width: 1100, height: 760)
}

#Preview("Batch · Dark") {
    NavigationStack {
        AddEntriesView(viewModel: PreviewData.addEntries())
    }
    .frame(width: 1100, height: 760)
    .preferredColorScheme(.dark)
}

#Preview("Load failed") {
    NavigationStack {
        AddEntriesView(viewModel: PreviewData.addEntries(failing: true))
    }
    .frame(width: 900, height: 500)
}
#endif

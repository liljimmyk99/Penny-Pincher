#if DEBUG
import SwiftUI

#Preview("Settings") {
    SettingsView(viewModel: PreviewData.settings())
}

#Preview("Settings · Dark") {
    SettingsView(viewModel: PreviewData.settings())
        .preferredColorScheme(.dark)
}
#endif

#if DEBUG
import SwiftUI

#Preview("Loaded") {
    NavigationStack {
        TemplatesView(viewModel: PreviewData.templates())
    }
    .frame(width: 1000, height: 760)
}

#Preview("Loaded · Dark") {
    NavigationStack {
        TemplatesView(viewModel: PreviewData.templates())
    }
    .frame(width: 1000, height: 760)
    .preferredColorScheme(.dark)
}

#Preview("Load failed") {
    NavigationStack {
        TemplatesView(viewModel: PreviewData.templates(failing: true))
    }
    .frame(width: 1000, height: 500)
}
#endif

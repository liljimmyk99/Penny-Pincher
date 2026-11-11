#if DEBUG
import SwiftUI

#Preview("Upload") {
    NavigationStack { ImportView(viewModel: PreviewData.importer(.upload)) }.frame(width: 900, height: 700)
}

#Preview("Review") {
    NavigationStack { ImportView(viewModel: PreviewData.importer(.review)) }.frame(width: 900, height: 900)
}

#Preview("Importing") {
    NavigationStack { ImportView(viewModel: PreviewData.importer(.running)) }.frame(width: 900, height: 600)
}

#Preview("Finished · Dark") {
    NavigationStack { ImportView(viewModel: PreviewData.importer(.finished)) }
        .frame(width: 900, height: 600)
        .preferredColorScheme(.dark)
}

#Preview("Banner") {
    VStack(spacing: 0) {
        ImportBanner(banner: .running(PreviewImports.running), progress: PreviewImports.progress, onView: {}, onDismiss: {})
        ImportBanner(banner: .finished(PreviewImports.completed), progress: nil, onView: {}, onDismiss: {})
        ImportBanner(banner: .stopped(PreviewImports.review), progress: nil, onView: {}, onDismiss: {})
    }
    .frame(width: 800)
}
#endif

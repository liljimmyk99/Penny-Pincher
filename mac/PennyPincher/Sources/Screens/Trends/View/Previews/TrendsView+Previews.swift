#if DEBUG
import SwiftUI

#Preview("Custom trends") {
    NavigationStack {
        TrendsView(viewModel: PreviewData.trends())
    }
    .frame(width: 1100, height: 820)
}

#Preview("Custom trends · Dark") {
    NavigationStack {
        TrendsView(viewModel: PreviewData.trends())
    }
    .frame(width: 1100, height: 820)
    .preferredColorScheme(.dark)
}

#Preview("No saved trends") {
    NavigationStack {
        TrendsView(viewModel: PreviewData.trends(empty: true))
    }
    .frame(width: 900, height: 500)
}

#Preview("By category") {
    NavigationStack {
        TrendsView(viewModel: PreviewData.trends(.byCategory))
    }
    .frame(width: 1100, height: 1000)
}

#Preview("By category · Dark") {
    NavigationStack {
        TrendsView(viewModel: PreviewData.trends(.byCategory))
    }
    .frame(width: 1100, height: 1000)
    .preferredColorScheme(.dark)
}

#Preview("Load failed") {
    NavigationStack {
        TrendsView(viewModel: PreviewData.trends(failing: true))
    }
    .frame(width: 800, height: 500)
}

#Preview("New trend") {
    NewTrendSheet(viewModel: PreviewData.newTrend(), onSave: {}, onCancel: {})
}
#endif

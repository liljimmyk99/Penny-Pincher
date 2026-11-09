#if DEBUG
import SwiftUI

#Preview("Month") {
    NavigationStack {
        SummaryView(viewModel: PreviewData.summary())
    }
    .frame(width: 1000, height: 820)
}

#Preview("Month · Dark") {
    NavigationStack {
        SummaryView(viewModel: PreviewData.summary())
    }
    .frame(width: 1000, height: 820)
    .preferredColorScheme(.dark)
}

#Preview("Donut") {
    let viewModel = PreviewData.summary()
    viewModel.chartMode = .donut
    return NavigationStack {
        SummaryView(viewModel: viewModel)
    }
    .frame(width: 1000, height: 820)
}

#Preview("Load failed") {
    NavigationStack {
        SummaryView(viewModel: PreviewData.summary(failing: true))
    }
    .frame(width: 800, height: 500)
}
#endif

#if DEBUG
import SwiftUI

#Preview("Year") {
    NavigationStack {
        YearlyView(viewModel: PreviewData.yearly())
    }
    .frame(width: 1000, height: 900)
}

#Preview("Year · Dark") {
    NavigationStack {
        YearlyView(viewModel: PreviewData.yearly())
    }
    .frame(width: 1000, height: 900)
    .preferredColorScheme(.dark)
}

#Preview("Load failed") {
    NavigationStack {
        YearlyView(viewModel: PreviewData.yearly(failing: true))
    }
    .frame(width: 800, height: 500)
}
#endif

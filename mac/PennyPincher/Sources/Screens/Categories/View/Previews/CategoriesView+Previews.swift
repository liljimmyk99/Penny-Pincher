#if DEBUG
import SwiftUI

#Preview("Loaded") {
    NavigationStack {
        CategoriesView(viewModel: PreviewData.categories())
    }
    .frame(width: 900, height: 700)
}

#Preview("Loaded · Dark") {
    NavigationStack {
        CategoriesView(viewModel: PreviewData.categories())
    }
    .frame(width: 900, height: 700)
    .preferredColorScheme(.dark)
}

#Preview("Load failed") {
    NavigationStack {
        CategoriesView(viewModel: PreviewData.categories(failing: true))
    }
    .frame(width: 900, height: 500)
}
#endif

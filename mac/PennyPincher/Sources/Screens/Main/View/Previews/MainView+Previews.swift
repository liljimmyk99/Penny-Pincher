#if DEBUG
import SwiftUI

#Preview("Member") {
    MainView(viewModel: PreviewData.main(PreviewData.member))
        .frame(width: 1000, height: 640)
}

#Preview("Admin") {
    MainView(viewModel: PreviewData.main(PreviewData.admin))
        .frame(width: 1000, height: 640)
}

#Preview("Admin · Dark") {
    MainView(viewModel: PreviewData.main(PreviewData.admin))
        .frame(width: 1000, height: 640)
        .preferredColorScheme(.dark)
}
#endif

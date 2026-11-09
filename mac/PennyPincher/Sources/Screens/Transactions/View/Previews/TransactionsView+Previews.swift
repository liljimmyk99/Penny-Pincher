#if DEBUG
import SwiftUI

#Preview("Month") {
    NavigationStack {
        TransactionsView(viewModel: PreviewData.transactions())
    }
    .frame(width: 1100, height: 760)
}

#Preview("Month · Dark") {
    NavigationStack {
        TransactionsView(viewModel: PreviewData.transactions())
    }
    .frame(width: 1100, height: 760)
    .preferredColorScheme(.dark)
}

#Preview("Load failed") {
    NavigationStack {
        TransactionsView(viewModel: PreviewData.transactions(failing: true))
    }
    .frame(width: 900, height: 500)
}
#endif

import SwiftUI

/// The signed-in window: sidebar plus the selected screen.
struct MainView: View {
    @Bindable var viewModel: MainViewModel

    var body: some View {
        NavigationSplitView(columnVisibility: $viewModel.columnVisibility) {
            SidebarList(items: viewModel.sidebarItems, selection: $viewModel.selection)
                .navigationSplitViewColumnWidth(min: 200, ideal: 220, max: 300)
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    AccountMenu(
                        viewModel: viewModel,
                        onImport: importTransactions,
                        onAdminDashboard: openAdminDashboard,
                        onSignOut: signOut
                    )
                    .padding(10)
                }
        } detail: {
            ScreenPlaceholder(item: viewModel.detailItem)
        }
    }
}

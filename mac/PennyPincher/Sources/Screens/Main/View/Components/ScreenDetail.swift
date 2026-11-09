import SwiftUI

/// The selected screen. Screens that arrive in later issues show a placeholder.
struct ScreenDetail: View {
    let item: SidebarItem
    let workspace: Workspace?

    var body: some View {
        switch (item, workspace) {
        case (.addEntries, .some(let workspace)):
            AddEntriesView(viewModel: workspace.addEntries)
        case (.transactions, .some(let workspace)):
            TransactionsView(viewModel: workspace.transactions)
        case (.categories, .some(let workspace)):
            CategoriesView(viewModel: workspace.categories)
        default:
            ScreenPlaceholder(item: item)
        }
    }
}

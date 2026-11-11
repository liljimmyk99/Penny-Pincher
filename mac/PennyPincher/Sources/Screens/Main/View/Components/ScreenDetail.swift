import SwiftUI

/// The selected screen. Screens that arrive in later issues show a placeholder.
struct ScreenDetail: View {
    let item: SidebarItem
    let workspace: Workspace?

    var body: some View {
        switch (item, workspace) {
        case (.summary, .some(let workspace)):
            SummaryView(viewModel: workspace.summary)
        case (.yearly, .some(let workspace)):
            YearlyView(viewModel: workspace.yearly)
        case (.trends, .some(let workspace)):
            TrendsView(viewModel: workspace.trends)
        case (.addEntries, .some(let workspace)):
            AddEntriesView(viewModel: workspace.addEntries)
        case (.transactions, .some(let workspace)):
            TransactionsView(viewModel: workspace.transactions)
        case (.templates, .some(let workspace)):
            TemplatesView(viewModel: workspace.templates)
        case (.categories, .some(let workspace)):
            CategoriesView(viewModel: workspace.categories)
        case (.importData, .some(let workspace)):
            ImportView(viewModel: workspace.importer)
        default:
            ScreenPlaceholder(item: item)
        }
    }
}

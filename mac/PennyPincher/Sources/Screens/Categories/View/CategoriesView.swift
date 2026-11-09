import SwiftUI

/// Categories & sources: two reorderable lists with inline rename and delete.
struct CategoriesView: View {
    @Bindable var viewModel: CategoriesViewModel
    @FocusState var renameFocused: Bool

    var body: some View {
        Group {
            if let message = viewModel.phase.errorMessage {
                LoadFailedView(message: message, onRetry: retry)
            } else if viewModel.phase == .loading {
                ProgressView("common.loading")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    if let message = viewModel.errorMessage ?? viewModel.statusMessage {
                        NoticeBanner(message: message, isError: viewModel.errorMessage != nil, onDismiss: dismissMessages)
                            .listRowSeparator(.hidden)
                    }
                    Section {
                        ForEach(viewModel.categoryRows) { row in
                            ManagedRowView(
                                row: row,
                                isRenaming: viewModel.isRenaming(.category, row.id),
                                renameText: $viewModel.renameText,
                                renameError: viewModel.renameError,
                                renameFocused: $renameFocused,
                                onRename: renameCategory,
                                onDelete: deleteCategory,
                                onMoveUp: moveCategoryUp,
                                onMoveDown: moveCategoryDown,
                                onCommitRename: commitRename,
                                onCancelRename: cancelRename
                            )
                            .moveDisabled(row.isLocked)
                        }
                        .onMove(perform: moveCategories)
                        AddItemField(placeholder: "categories.add.placeholder", buttonTitle: "categories.add.button",
                                     text: $viewModel.newCategoryName, error: viewModel.addCategoryError,
                                     isDisabled: viewModel.isSaving, onAdd: addCategory)
                    } header: {
                        ManageSectionHeader(title: "categories.section.categories",
                                            columns: ["categories.column.entries", "categories.column.spent"])
                    } footer: {
                        Text("categories.footer.categories")
                    }
                    Section {
                        ForEach(viewModel.sourceRows) { row in
                            ManagedRowView(
                                row: row,
                                isRenaming: viewModel.isRenaming(.source, row.id),
                                renameText: $viewModel.renameText,
                                renameError: viewModel.renameError,
                                renameFocused: $renameFocused,
                                onRename: renameSource,
                                onDelete: deleteSource,
                                onMoveUp: moveSourceUp,
                                onMoveDown: moveSourceDown,
                                onCommitRename: commitRename,
                                onCancelRename: cancelRename
                            )
                            .moveDisabled(row.isLocked)
                        }
                        .onMove(perform: moveSources)
                        AddItemField(placeholder: "sources.add.placeholder", buttonTitle: "sources.add.button",
                                     text: $viewModel.newSourceName, error: viewModel.addSourceError,
                                     isDisabled: viewModel.isSaving, onAdd: addSource)
                    } header: {
                        ManageSectionHeader(title: "categories.section.sources",
                                            columns: ["categories.column.entries", "categories.column.gross",
                                                      "categories.column.net", "categories.column.taxRate"])
                    } footer: {
                        Text("categories.footer.sources")
                    }
                }
                .listStyle(.inset(alternatesRowBackgrounds: true))
            }
        }
        .navigationTitle(Text("sidebar.categories"))
        .navigationSubtitle(viewModel.eyebrow)
        .task(load)
        .confirmationDialog(
            viewModel.pendingDelete?.title ?? "",
            isPresented: deleteDialogPresented,
            titleVisibility: .visible,
            presenting: viewModel.pendingDelete
        ) { request in
            Button(request.confirmTitle, role: .destructive, action: confirmDelete)
            Button("common.cancel", role: .cancel, action: cancelDelete)
        } message: { request in
            Text(request.message)
        }
    }
}

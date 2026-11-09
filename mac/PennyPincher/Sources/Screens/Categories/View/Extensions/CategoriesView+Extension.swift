import SwiftUI

extension CategoriesView {
    func load() async {
        await viewModel.load()
    }

    func retry() {
        Task { await viewModel.load() }
    }

    func renameCategory(_ id: String) {
        viewModel.beginRename(.category, id)
        renameFocused = true
    }

    func renameSource(_ id: String) {
        viewModel.beginRename(.source, id)
        renameFocused = true
    }

    func commitRename() {
        Task { await viewModel.commitRename() }
    }

    func cancelRename() {
        viewModel.cancelRename()
    }

    func deleteCategory(_ id: String) {
        viewModel.requestDelete(.category, id)
    }

    func deleteSource(_ id: String) {
        viewModel.requestDelete(.source, id)
    }

    func confirmDelete() {
        Task { await viewModel.confirmDelete() }
    }

    func cancelDelete() {
        viewModel.pendingDelete = nil
    }

    var deleteDialogPresented: Binding<Bool> {
        Binding(get: { viewModel.pendingDelete != nil }, set: { if !$0 { viewModel.pendingDelete = nil } })
    }

    func moveCategories(from source: IndexSet, to destination: Int) {
        Task { await viewModel.move(.category, from: source, to: destination) }
    }

    func moveSources(from source: IndexSet, to destination: Int) {
        Task { await viewModel.move(.source, from: source, to: destination) }
    }

    func moveCategoryUp(_ id: String) {
        Task { await viewModel.move(.category, id, by: -1) }
    }

    func moveCategoryDown(_ id: String) {
        Task { await viewModel.move(.category, id, by: 1) }
    }

    func moveSourceUp(_ id: String) {
        Task { await viewModel.move(.source, id, by: -1) }
    }

    func moveSourceDown(_ id: String) {
        Task { await viewModel.move(.source, id, by: 1) }
    }

    func addCategory() {
        Task { await viewModel.addCategory() }
    }

    func addSource() {
        Task { await viewModel.addSource() }
    }

    func dismissMessages() {
        viewModel.dismissMessages()
    }
}

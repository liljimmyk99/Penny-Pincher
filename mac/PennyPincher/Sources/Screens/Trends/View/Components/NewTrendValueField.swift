import SwiftUI

/// What the new trend matches: a past merchant (with suggestions), a category,
/// or text in the note.
struct NewTrendValueField: View {
    @Bindable var viewModel: NewTrendViewModel

    var body: some View {
        switch viewModel.matchType {
        case .merchant:
            TextField(String(localized: viewModel.valueTitle), text: $viewModel.merchant,
                      prompt: Text("trends.new.merchantPrompt"))
                .textInputSuggestions {
                    ForEach(viewModel.merchantSuggestions) { merchant in
                        Text(merchant.name)
                            .textInputCompletion(merchant.name)
                    }
                }
        case .category:
            CategoryPicker(title: "trends.new.category", categories: viewModel.categories,
                           selection: $viewModel.categoryID)
        case .note:
            TextField(String(localized: viewModel.valueTitle), text: $viewModel.text,
                      prompt: Text("trends.new.notePrompt"))
        }
    }
}

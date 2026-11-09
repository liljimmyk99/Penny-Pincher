import SwiftUI

/// A pop-up of the user's categories, in their order; empty means none chosen yet.
struct CategoryPicker: View {
    let title: LocalizedStringKey
    let categories: [ExpenseCategory]
    @Binding var selection: String

    var body: some View {
        Picker(title, selection: $selection) {
            Text("picker.choose").tag("")
            ForEach(categories) { category in
                Text(category.name).tag(category.id)
            }
        }
    }
}

import SwiftUI

/// A pop-up of the user's income sources, in their order.
struct SourcePicker: View {
    let title: LocalizedStringKey
    let sources: [IncomeSource]
    @Binding var selection: String

    var body: some View {
        Picker(title, selection: $selection) {
            Text("picker.choose").tag("")
            ForEach(sources) { source in
                Text(source.name).tag(source.id)
            }
        }
    }
}

import SwiftUI

/// The saved trends, each with what it matches, its measure and a sparkline.
struct SavedTrendList: View {
    let rows: [SavedTrendRow]
    @Binding var selection: String?

    var body: some View {
        List(rows, selection: $selection) { row in
            SavedTrendRowView(row: row)
        }
        .listStyle(.sidebar)
        .accessibilityLabel(Text("trends.list.title"))
    }
}

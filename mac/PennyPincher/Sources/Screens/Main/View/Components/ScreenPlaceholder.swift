import SwiftUI

/// Where the sidebar's screens will go; each one arrives in its own issue.
struct ScreenPlaceholder: View {
    let item: SidebarItem

    var body: some View {
        ContentUnavailableView {
            SidebarRow(item: item)
        } description: {
            Text("placeholder.description")
        }
        .navigationTitle(Text(item.title))
    }
}

import SwiftUI

struct SidebarRow: View {
    let item: SidebarItem

    var body: some View {
        Label {
            Text(item.title)
        } icon: {
            Image(systemName: item.symbol)
        }
    }
}

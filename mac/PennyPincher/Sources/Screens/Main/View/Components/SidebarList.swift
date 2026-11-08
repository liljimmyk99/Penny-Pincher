import SwiftUI

struct SidebarList: View {
    let items: [SidebarItem]
    @Binding var selection: SidebarItem?

    var body: some View {
        List(items, selection: $selection) { item in
            SidebarRow(item: item)
                .tag(item)
        }
    }
}

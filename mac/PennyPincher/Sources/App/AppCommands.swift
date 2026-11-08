import SwiftUI

/// The menu bar: View ▸ Toggle Sidebar (⌃⌘S) and File ▸ New Expense (⌘N).
struct AppCommands: Commands {
    let main: MainViewModel?

    var body: some Commands {
        SidebarCommands()
        CommandGroup(replacing: .newItem) {
            Button("menu.newExpense") { main?.newExpense() }
                .keyboardShortcut("n")
                .disabled(!(main?.canAddEntries ?? false))
        }
    }
}

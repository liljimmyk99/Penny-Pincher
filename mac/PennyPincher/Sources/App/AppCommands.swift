import SwiftUI

/// The menu bar: File ▸ New Expense (⌘N), View ▸ Toggle Sidebar (⌃⌘S) and
/// View ▸ Previous/Next Month (⌘[ and ⌘], which text fields leave alone).
struct AppCommands: Commands {
    let main: MainViewModel?

    var body: some Commands {
        SidebarCommands()
        CommandGroup(replacing: .newItem) {
            Button("menu.newExpense") { main?.newExpense() }
                .keyboardShortcut("n")
                .disabled(!(main?.canAddEntries ?? false))
        }
        CommandGroup(after: .sidebar) {
            Divider()
            Button("menu.previousMonth") { main?.previousMonth() }
                .keyboardShortcut("[")
                .disabled(!(main?.canChangeMonth ?? false))
            Button("menu.nextMonth") { main?.nextMonth() }
                .keyboardShortcut("]")
                .disabled(!(main?.canChangeMonth ?? false))
        }
    }
}

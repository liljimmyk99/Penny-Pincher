import SwiftUI

/// The signed-in person in the sidebar footer, and their menu: Settings,
/// Import transactions, Export data, Admin dashboard (admins only, opens the
/// web app) and Sign out.
struct AccountMenu: View {
    let viewModel: MainViewModel
    let onImport: () -> Void
    let onExport: () -> Void
    let onAdminDashboard: () -> Void
    let onSignOut: () -> Void

    var body: some View {
        Menu {
            if let signedIn = viewModel.signedInText {
                Section {
                    Text(signedIn)
                }
            }
            SettingsLink {
                Label("account.settings", systemImage: "gearshape")
            }
            Button("account.import", systemImage: "square.and.arrow.down", action: onImport)
            Button("account.export", systemImage: "square.and.arrow.up", action: onExport)
            if viewModel.isAdmin {
                Button("account.admin", systemImage: "shield", action: onAdminDashboard)
            }
            Divider()
            Button("account.signOut", systemImage: "rectangle.portrait.and.arrow.right", action: onSignOut)
        } label: {
            AccountMenuLabel(name: viewModel.accountName, initial: viewModel.accountInitial, role: viewModel.roleTitle)
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .accessibilityLabel(viewModel.accountAccessibilityLabel)
    }
}

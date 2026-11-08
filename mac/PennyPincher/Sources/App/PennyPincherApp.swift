import SwiftUI

@main
struct PennyPincherApp: App {
    /// nil under unit tests, which run inside the app.
    @State private var container: AppContainer? = AppContainer.isRunningTests ? nil : AppContainer.live()

    var body: some Scene {
        Window("app.name", id: "main") {
            if let container {
                RootView(viewModel: container.root)
            }
        }
        .defaultSize(width: 1100, height: 720)
        .commands { AppCommands(main: container?.main) }

        Settings {
            if let container {
                SettingsView(viewModel: container.settings)
            }
        }
    }
}

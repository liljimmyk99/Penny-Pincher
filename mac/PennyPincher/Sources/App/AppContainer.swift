import Foundation

/// The composition root: builds the services and the long-lived view models
/// once, from the Info.plist config (Config/*.xcconfig).
@MainActor
final class AppContainer {
    let setup: AppSetup
    let appearance: AppearanceService
    let root: RootViewModel
    let settings: SettingsViewModel

    init(setup: AppSetup, appearance: AppearanceService) {
        self.setup = setup
        self.appearance = appearance
        root = RootViewModel(setup: setup, appearance: appearance)
        settings = SettingsViewModel(appearance: appearance)
    }

    /// The main window's view model, once the app is configured. The menu bar uses it.
    var main: MainViewModel? {
        if case .ready(_, let main) = setup { main } else { nil }
    }

    /// Unit tests run inside the app: they must not touch the Keychain.
    nonisolated static var isRunningTests: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }

    /// The real app: username and password sign-in and the API at the configured server.
    static func live(info: [String: Any] = Bundle.main.infoDictionary ?? [:]) -> AppContainer {
        let appearance = AppearanceService()
        switch AppConfig.load(from: info) {
        case .failure(let problem):
            return AppContainer(setup: .misconfigured(problem), appearance: appearance)
        case .success(let config):
            let store = SessionTokenStore()
            let auth = APIAuthService(serverURL: config.serverURL, store: store)
            let relay = SessionErrorRelay()
            let api = APIClient(
                serverURL: config.serverURL,
                token: { store.token },
                onSessionError: { error in relay.send(error) }
            )
            let session = SessionService(auth: auth, api: api)
            relay.session = session
            session.start()
            let events = ImportEventStream(
                serverURL: config.serverURL,
                token: { store.token },
                onSessionError: { error in relay.send(error) }
            )
            let main = MainViewModel(session: session, api: api, adminURL: config.adminURL,
                                     importEvents: events, notifier: .live)
            return AppContainer(setup: .ready(session: session, main: main), appearance: appearance)
        }
    }
}
